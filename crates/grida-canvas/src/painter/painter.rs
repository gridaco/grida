use super::effects_noise;
use super::geometry::*;
use super::layer::{Layer, LayerList, PainterMaskGroup, PainterPictureLayer, PainterRenderCommand};
use super::paint;
use super::shadow;
use super::text_stroke;
use crate::cache::{scene::SceneCache, vector_path::VectorPathCache};
use crate::cg::prelude::*;
use crate::node::schema::*;
use crate::runtime::render_policy::{OutlineStyle, RenderPolicy};
use crate::runtime::{font_repository::FontRepository, image_repository::ImageRepository};
use crate::shape::*;
use crate::sk;
use crate::vectornetwork::vn_painter::StrokeOptions;
use crate::vectornetwork::VectorNetwork;
use math2::transform::AffineTransform;
use skia_safe::{
    canvas::SaveLayerRec, textlayout, Matrix, Paint as SkPaint, Path, PathBuilder, Point, Rect,
    Shader,
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
    cache_hits: RefCell<usize>,
    policy: RenderPolicy,
    variant_key: u64,
}

impl<'a> Painter<'a> {
    #[inline]
    fn with_optional_clip_path<F: FnOnce()>(&self, clip: Option<&Path>, f: F) {
        if self.policy.ignore_clips_content {
            f();
            return;
        }
        if let Some(clip) = clip {
            self.canvas.save();
            self.canvas.clip_path(clip, None, true);
            f();
            self.canvas.restore();
        } else {
            f();
        }
    }

    #[inline]
    fn draw_mask_group_or_passthrough(&self, group: &PainterMaskGroup) {
        if self.policy.ignore_clips_content {
            // Ignore masks/clips: draw content as-is (no mask application).
            self.draw_render_commands(&group.content_commands);
        } else {
            self.draw_mask_group(group);
        }
    }

    /// Create a new Painter that uses the SceneCache's paragraph cache
    pub fn new_with_scene_cache(
        canvas: &'a skia_safe::Canvas,
        fonts: &'a FontRepository,
        images: &'a ImageRepository,
        scene_cache: &'a SceneCache,
        policy: RenderPolicy,
    ) -> Self {
        let variant_key = policy.variant_key();
        Self {
            canvas,
            fonts,
            images,
            path_cache: RefCell::new(VectorPathCache::new()),
            scene_cache: Some(scene_cache), // Store reference to scene cache
            cache_hits: RefCell::new(0),
            policy,
            variant_key,
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

    /// Wrap drawing in an alpha mask using a shader.
    ///
    /// Steps:
    /// 1) save_layer(bounds)
    /// 2) draw content via closure
    /// 3) draw a rect with DstIn using the provided shader as the alpha mask
    pub fn with_alpha_mask<F: FnOnce()>(&self, bounds: Rect, mask_shader: Shader, draw_content: F) {
        let rec = SaveLayerRec::default().bounds(&bounds);
        self.canvas.save_layer(&rec);

        draw_content();

        let mut p = SkPaint::default();
        p.set_anti_alias(true);
        p.set_blend_mode(skia_safe::BlendMode::DstIn);
        p.set_shader(mask_shader);
        self.canvas.draw_rect(bounds, &p);

        self.canvas.restore();
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

    /// Calculate safe bounds for blend mode isolation layer in world coordinates.
    ///
    /// Must include drop shadows which extend beyond shape.rect.
    /// Layer blur and backdrop effects handle their own save_layer bounds.
    ///
    /// Parameters:
    /// - shape: Shape with bounds in LOCAL coordinates (0,0 based)
    /// - effects: Layer effects for drop shadow expansion
    /// - transform: Transform matrix to convert local bounds to world coordinates
    ///
    /// # TODO: Move to Geometry Stage
    ///
    /// Pre-compute blend mode bounds in the geometry stage (similar to `compute_render_bounds`
    /// in `cache::geometry`). This would unify all geometry computations (world/absolute/local transforms,
    /// render bounds, blend mode isolation bounds) in a single place, ensuring consistency and avoiding
    /// redundant calculations during rendering. The geometry cache already computes `absolute_render_bounds`
    /// which includes effect expansion - blend mode isolation bounds could be added as a separate field
    /// or computed alongside render bounds.
    fn compute_blend_mode_bounds(
        shape: &PainterShape,
        effects: &LayerEffects,
        transform: &[[f32; 3]; 2],
    ) -> Rect {
        // Start with local bounds (0,0 based)
        let mut local_bounds = shape.rect;

        // Expand for drop shadows in local space (drawn inside blend mode isolation)
        for shadow in &effects.shadows {
            if let FilterShadowEffect::DropShadow(ds) = shadow {
                // Calculate shadow bounds at offset position
                let mut shadow_bounds = local_bounds;
                // Offset the bounds by shadow dx, dy
                shadow_bounds = Rect::from_xywh(
                    shadow_bounds.x() + ds.dx,
                    shadow_bounds.y() + ds.dy,
                    shadow_bounds.width(),
                    shadow_bounds.height(),
                );

                // Apply spread (expand or contract)
                if ds.spread != 0.0 {
                    let expansion = ds.spread.abs();
                    shadow_bounds = shadow_bounds.with_outset((expansion, expansion));
                }

                // Apply blur expansion (3x sigma for Gaussian coverage)
                if ds.blur > 0.0 {
                    shadow_bounds = shadow_bounds.with_outset((ds.blur * 3.0, ds.blur * 3.0));
                }

                // Union with original bounds to include entire shadow area
                local_bounds = Rect::from_ltrb(
                    local_bounds.left().min(shadow_bounds.left()),
                    local_bounds.top().min(shadow_bounds.top()),
                    local_bounds.right().max(shadow_bounds.right()),
                    local_bounds.bottom().max(shadow_bounds.bottom()),
                );
            }
        }

        // Transform local bounds to world coordinates using the layer transform
        // Convert Skia Rect to math2 Rectangle for transformation
        let math_rect = math2::rect::Rectangle {
            x: local_bounds.left(),
            y: local_bounds.top(),
            width: local_bounds.width(),
            height: local_bounds.height(),
        };

        let affine_transform = math2::transform::AffineTransform { matrix: *transform };
        let world_rect = math2::rect::transform(math_rect, &affine_transform);

        // Convert back to Skia Rect
        Rect::from_xywh(
            world_rect.x,
            world_rect.y,
            world_rect.width,
            world_rect.height,
        )
    }

    /// If blend mode is not PassThrough, wrap drawing in a bounds-optimized save_layer.
    ///
    /// Performance: Uses bounds-based save_layer to limit offscreen buffer size (~100x smaller).
    /// Spec compliance: Preserves isolation semantics - all blend modes (including Normal) are isolated.
    ///
    /// Bounds safety: Includes drop shadows which extend beyond base shape bounds.
    ///
    /// Note: transform parameter is needed to convert shape.rect (local coordinates) to world coordinates.
    pub fn with_blendmode<F: FnOnce()>(
        &self,
        layer_blend_mode: LayerBlendMode,
        shape: &PainterShape,
        effects: &LayerEffects,
        transform: &[[f32; 3]; 2],
        f: F,
    ) {
        match layer_blend_mode {
            LayerBlendMode::PassThrough => {
                // No isolation - draw directly (fast path)
                f();
            }
            LayerBlendMode::Blend(blend_mode) => {
                // Compute safe bounds in world coordinates (shape.rect is in local space)
                let bounds = Self::compute_blend_mode_bounds(shape, effects, transform);

                let mut paint = SkPaint::default();
                paint.set_blend_mode(blend_mode.into());

                // Use bounds-based save_layer (much smaller than full canvas)
                let layer_rec = SaveLayerRec::default().bounds(&bounds).paint(&paint);

                self.canvas.save_layer(&layer_rec);
                f();
                self.canvas.restore();
            }
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

    /// Wrap a closure `f` in a layer that applies a blur to everything drawn inside.
    fn with_layer_blur<F: FnOnce()>(&self, blur: &FeBlur, bounds: Rect, f: F) {
        let canvas = self.canvas;

        // Calculate expansion based on blur type
        let expansion = match blur {
            FeBlur::Gaussian(gaussian) => 3.0 * gaussian.radius,
            FeBlur::Progressive(progressive) => 3.0 * progressive.radius.max(progressive.radius2),
        };

        let expanded_bounds = bounds.with_outset((expansion, expansion));

        let image_filter = match blur {
            FeBlur::Gaussian(gaussian) => {
                skia_safe::image_filters::blur((gaussian.radius, gaussian.radius), None, None, None)
            }
            FeBlur::Progressive(progressive) => Some(
                crate::painter::effects::create_progressive_blur_image_filter(progressive, bounds),
            ),
        };
        if let Some(filter) = image_filter {
            let mut paint = SkPaint::default();
            paint.set_image_filter(filter);
            canvas.save_layer(
                &SaveLayerRec::default()
                    .bounds(&expanded_bounds)
                    .paint(&paint),
            );
            f();
            canvas.restore();
        } else {
            f();
        }
    }

    /// Draw a drop shadow behind the content using a shape.
    fn draw_shadow(&self, shape: &PainterShape, shadow: &FeShadow) {
        shadow::draw_drop_shadow(self.canvas, shape, shadow);
    }

    /// Draw an inner shadow clipped to the given shape.
    fn draw_inner_shadow(&self, shape: &PainterShape, shadow: &FeShadow) {
        shadow::draw_inner_shadow(self.canvas, shape, shadow);
    }

    /// Draw noise effects on top of fills.
    ///
    /// Noise effects only render when called after fills have been drawn.
    /// They appear as textured overlays on filled regions, before strokes are applied.
    ///
    /// Supported for:
    /// - Shape nodes (Rectangle, Ellipse, Polygon, Star, etc.)
    /// - Vector network nodes
    ///
    /// # Note
    ///
    /// Text noise rendering would require special handling for glyph positioning.
    fn draw_noise_effects(&self, shape: &PainterShape, noises: &[FeNoiseEffect]) {
        for noise in noises {
            effects_noise::render_noise_effect(noise, self.canvas, shape);
        }
    }

    /// Draw strokes for a vector network using VNPainter.
    ///
    /// This is called after fills and noise effects have been applied.
    fn draw_vector_strokes(
        &self,
        vn_painter: &crate::vectornetwork::vn_painter::VNPainter,
        vn: &VectorNetwork,
        stroke_opts: &StrokeOptions,
        corner_radius: f32,
    ) {
        if let Some(var_width_profile) = &stroke_opts.width_profile {
            vn_painter.draw_variable_width_with_corner(
                vn,
                stroke_opts,
                var_width_profile,
                corner_radius,
            );
        } else {
            vn_painter.draw_stroke_regular(vn, stroke_opts, corner_radius);
        }
    }

    /// Draw a text drop shadow using a paragraph as the source.
    fn draw_text_shadow(
        &self,
        paragraph: &Rc<RefCell<textlayout::Paragraph>>,
        shadow: &FeShadow,
        y_offset: f32,
    ) {
        // Compute paragraph bounds (in text coordinate space, before y_offset translation)
        let (text_width, text_height) = {
            let para_ref = paragraph.borrow();
            (para_ref.max_width(), para_ref.height())
        };
        let text_bounds = Rect::from_xywh(0.0, y_offset, text_width, text_height);

        // Expand bounds for drop shadow: offset + spread + blur expansion
        let mut shadow_bounds = text_bounds;
        // Offset by shadow dx, dy
        shadow_bounds = Rect::from_xywh(
            shadow_bounds.x() + shadow.dx,
            shadow_bounds.y() + shadow.dy,
            shadow_bounds.width(),
            shadow_bounds.height(),
        );
        // Apply spread (expand or contract)
        if shadow.spread != 0.0 {
            let expansion = shadow.spread.abs();
            shadow_bounds = shadow_bounds.with_outset((expansion, expansion));
        }
        // Apply blur expansion (3x sigma for Gaussian coverage)
        if shadow.blur > 0.0 {
            shadow_bounds = shadow_bounds.with_outset((shadow.blur * 3.0, shadow.blur * 3.0));
        }
        // Union with original bounds to include entire shadow area
        let bounds = Rect::from_ltrb(
            text_bounds.left().min(shadow_bounds.left()),
            text_bounds.top().min(shadow_bounds.top()),
            text_bounds.right().max(shadow_bounds.right()),
            text_bounds.bottom().max(shadow_bounds.bottom()),
        );

        let mut paint = SkPaint::default();
        paint.set_image_filter(shadow::drop_shadow_image_filter(shadow));
        paint.set_anti_alias(true);
        self.canvas
            .save_layer(&SaveLayerRec::default().bounds(&bounds).paint(&paint));
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
        // Compute paragraph bounds (in text coordinate space, before y_offset translation)
        // Inner shadows are clipped to the text bounds, but still need expansion for blur
        let (text_width, text_height) = {
            let para_ref = paragraph.borrow();
            (para_ref.max_width(), para_ref.height())
        };
        let mut bounds = Rect::from_xywh(0.0, y_offset, text_width, text_height);

        // Expand bounds for inner shadow blur (inner shadows are clipped to shape, but blur needs expansion)
        // Note: inner shadows don't use offset/spread expansion like drop shadows since they're clipped
        if shadow.blur > 0.0 {
            bounds = bounds.with_outset((shadow.blur * 3.0, shadow.blur * 3.0));
        }

        let mut paint = SkPaint::default();
        paint.set_image_filter(shadow::inner_shadow_image_filter(shadow));
        paint.set_anti_alias(true);
        self.canvas
            .save_layer(&SaveLayerRec::default().bounds(&bounds).paint(&paint));
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
        blur: &FeBlur,
        y_offset: f32,
    ) {
        // Build a path from all glyphs in the paragraph.
        let mut builder = PathBuilder::new();
        paragraph.borrow_mut().visit(|_, info| {
            if let Some(info) = info {
                let glyphs = info.glyphs();
                let positions = info.positions();
                let origin = info.origin();
                let font = info.font();
                for (glyph, pos) in glyphs.iter().zip(positions.iter()) {
                    if let Some(glyph_path) = font.get_path(*glyph) {
                        let offset = Point::new(pos.x + origin.x, pos.y + origin.y + y_offset);
                        if offset.x != 0.0 || offset.y != 0.0 {
                            let transformed =
                                glyph_path.make_transform(&Matrix::translate((offset.x, offset.y)));
                            builder.add_path(&transformed);
                        } else {
                            builder.add_path(&glyph_path);
                        }
                    }
                }
            }
        });
        let path = builder.detach();

        if path.is_empty() {
            return;
        }

        let canvas = self.canvas;
        let text_bounds = path.bounds();

        // Calculate expansion based on blur type
        let expansion = match blur {
            FeBlur::Gaussian(gaussian) => 3.0 * gaussian.radius,
            FeBlur::Progressive(progressive) => 3.0 * progressive.radius.max(progressive.radius2),
        };

        let expanded_bounds = text_bounds.with_outset((expansion, expansion));

        let image_filter = match blur {
            FeBlur::Gaussian(gaussian) => {
                skia_safe::image_filters::blur((gaussian.radius, gaussian.radius), None, None, None)
            }
            FeBlur::Progressive(progressive) => Some(
                crate::painter::effects::create_progressive_blur_image_filter(
                    progressive,
                    *text_bounds,
                ),
            ),
        };

        let Some(filter) = image_filter else {
            return;
        };

        canvas.save();
        canvas.clip_path(&path, None, true);
        let layer_rec = SaveLayerRec::default()
            .bounds(&expanded_bounds)
            .backdrop(&filter);
        canvas.save_layer(&layer_rec);
        canvas.restore();
        canvas.restore();
    }

    /// Draw a backdrop blur: blur what's behind the shape.
    fn draw_backdrop_blur(&self, shape: &PainterShape, blur: &FeBlur) {
        let canvas = self.canvas;

        // Calculate expansion based on blur type
        let expansion = match blur {
            FeBlur::Gaussian(gaussian) => 3.0 * gaussian.radius,
            FeBlur::Progressive(progressive) => 3.0 * progressive.radius.max(progressive.radius2),
        };

        let expanded_bounds = shape.rect.with_outset((expansion, expansion));

        let image_filter = match blur {
            FeBlur::Gaussian(gaussian) => {
                skia_safe::image_filters::blur((gaussian.radius, gaussian.radius), None, None, None)
            }
            FeBlur::Progressive(progressive) => Some(
                crate::painter::effects::create_progressive_blur_image_filter(
                    progressive,
                    shape.rect,
                ),
            ),
        };

        if let Some(filter) = image_filter {
            // 1) Clip to the shape
            canvas.save();
            canvas.clip_path(&shape.to_path(), None, true);

            // 2) Use a SaveLayerRec with a backdrop filter so that everything behind is blurred
            let layer_rec = SaveLayerRec::default()
                .bounds(&expanded_bounds)
                .backdrop(&filter);
            canvas.save_layer(&layer_rec);

            // We don't draw any content here—just pushing and popping the layer
            canvas.restore(); // pop the SaveLayer
            canvas.restore(); // pop the clip
        }
    }

    /// Draw liquid glass effect for a shape using SaveLayer backdrop.
    ///
    /// This renders a physically-based glass effect with refraction, chromatic aberration,
    /// and Fresnel reflections using Skia's SaveLayer backdrop mechanism.
    ///
    /// The backdrop approach automatically captures the background without manual snapshots,
    /// making it work seamlessly with both GPU and CPU backends.
    ///
    /// # Note
    /// - Supports rectangular shapes with per-corner radii (extracted from RRect shapes)
    /// - Rotation baked into the geometry via transformation matrix (applied via `with_transform`)
    fn draw_glass_effect(&self, shape: &PainterShape, glass: &FeLiquidGlass) {
        let canvas = self.canvas;
        let bounds = shape.rect;
        let width = bounds.width();
        let height = bounds.height();

        // Get canvas size from device bounds
        let device_bounds = canvas.device_clip_bounds().unwrap_or_default();
        let canvas_size = (device_bounds.width() as f32, device_bounds.height() as f32);

        // Extract corner radii from shape (returns [0,0,0,0] for non-rounded shapes)
        let corner_radii = shape.corner_radii();

        // Rotation is applied via transform matrix (already in canvas state from with_transform)
        // The shader receives rotation=0.0 since the transform is baked into the canvas
        let rotation = 0.0;

        // Create the glass ImageFilter
        let glass_filter = crate::painter::effects::create_liquid_glass_image_filter(
            width,
            height,
            corner_radii,
            rotation,
            canvas_size,
            glass,
        );

        // Apply glass effect using SaveLayer with backdrop
        canvas.save();
        canvas.translate((bounds.x(), bounds.y()));

        // Clip using the most efficient method based on shape type
        if let Some(rect) = shape.rect_shape {
            canvas.clip_rect(rect, None, true);
        } else if let Some(rrect) = &shape.rrect {
            canvas.clip_rrect(rrect, None, true);
        } else {
            canvas.clip_path(&shape.to_path(), None, true);
        }

        // SaveLayer with backdrop captures background and applies filter
        // Use bounds relative to translated origin (0,0 based after translation)
        let layer_bounds = Rect::from_xywh(0.0, 0.0, width, height);
        let layer_rec = SaveLayerRec::default()
            .bounds(&layer_bounds)
            .backdrop(&glass_filter);
        canvas.save_layer(&layer_rec);

        canvas.restore();
        canvas.restore();
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
        stroke_cap: StrokeCap,
        stroke_join: StrokeJoin,
        stroke_miter_limit: StrokeMiterLimit,
        stroke_dash_array: Option<&StrokeDashArray>,
    ) {
        if stroke_width <= 0.0 || strokes.is_empty() {
            return;
        }
        let stroke_path = stroke_geometry(
            &shape.to_path(),
            stroke_width,
            stroke_align,
            stroke_cap,
            stroke_join,
            stroke_miter_limit,
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

    /// Draw stroke decoration markers at the start/end endpoints of a path.
    pub fn draw_stroke_decorations(
        &self,
        shape: &PainterShape,
        strokes: &[Paint],
        stroke_width: f32,
        start: StrokeDecoration,
        end: StrokeDecoration,
    ) {
        if !start.has_marker() && !end.has_marker() {
            return;
        }
        if let Some(sk_paint) = paint::sk_paint_stack(
            strokes,
            (shape.rect.width(), shape.rect.height()),
            self.images,
        ) {
            crate::shape::marker::draw_endpoint_decorations(
                self.canvas,
                &shape.to_path(),
                start,
                end,
                stroke_width,
                &sk_paint,
            );
        }
    }

    /// Draw a shape applying all layer effects in the correct order.
    ///
    /// Effect ordering (as per specification):
    /// 1. Drop shadows (before everything)
    /// 2. Glass or Backdrop Blur (mutually exclusive - glass takes precedence if both present)
    /// 3. Content:
    ///    a. Fills
    ///    b. Noise (only if fills are visible)
    ///    c. Strokes
    /// 4. Inner shadows (after content)
    /// 5. Layer blur (wraps everything)
    pub fn draw_shape_with_effects<F: Fn()>(
        &self,
        effects: &LayerEffects,
        shape: &PainterShape,
        draw_content: F,
    ) {
        let apply_effects = || {
            // 1. Drop shadows (before everything)
            for shadow in &effects.shadows {
                if let FilterShadowEffect::DropShadow(ds) = shadow {
                    self.draw_shadow(shape, ds);
                }
            }

            // 2. Glass or Backdrop Blur (mutually exclusive)
            // Glass takes precedence over backdrop blur if both are present
            if let Some(glass) = &effects.glass {
                self.draw_glass_effect(shape, glass);
            } else if let Some(blur) = &effects.backdrop_blur {
                self.draw_backdrop_blur(shape, &blur.blur);
            }

            // 3. Content (fills/strokes)
            draw_content();

            // 4. Inner shadows (after content)
            for shadow in &effects.shadows {
                if let FilterShadowEffect::InnerShadow(is) = shadow {
                    self.draw_inner_shadow(shape, is);
                }
            }
        };

        // 5. Layer blur (wraps everything)
        if let Some(layer_blur) = &effects.blur {
            self.with_layer_blur(&layer_blur.blur, shape.rect, apply_effects);
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
        // Allow stroke-only text: we still need a paragraph to visit glyph runs for stroking.
        if fills.is_empty() && (strokes.is_empty() || stroke_width <= 0.0) {
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
            true,
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
        render_fill: bool,
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
        if render_fill {
            paragraph.borrow().paint(self.canvas, Point::new(0.0, 0.0));
        }

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
        if !self.policy.is_wireframe() {
            self.draw_layer_standard(layer);
            return;
        }

        let Some(style) = self.policy.outline_style() else {
            return;
        };
        self.draw_layer_outline(layer, style);
    }

    fn draw_layer_standard(&self, layer: &PainterPictureLayer) {
        match layer {
            PainterPictureLayer::Shape(shape_layer) => {
                self.with_blendmode(
                    shape_layer.base.blend_mode,
                    &shape_layer.shape,
                    &shape_layer.effects,
                    &shape_layer.base.transform.matrix,
                    || {
                        self.with_transform(&shape_layer.base.transform.matrix, || {
                            let shape = &shape_layer.shape;
                            let effect_ref = &shape_layer.effects;
                            let clip_path = &shape_layer.base.clip_path;
                            let draw_content = || {
                                self.with_opacity(shape_layer.base.opacity, || {
                                    // 1. Fills
                                    if self.policy.render_fills() {
                                        self.draw_fills(shape, &shape_layer.fills);

                                        // 2. Noise (only if fills are visible)
                                        if !shape_layer.fills.is_empty()
                                            && !effect_ref.noises.is_empty()
                                        {
                                            self.draw_noise_effects(shape, &effect_ref.noises);
                                        }
                                    }

                                    // 3. Strokes
                                    if self.policy.render_strokes() {
                                        if let Some(path) = &shape_layer.stroke_path {
                                            self.draw_stroke_path(
                                                shape,
                                                path,
                                                &shape_layer.strokes,
                                            );
                                        }

                                        // 4. Stroke decorations (markers at endpoints)
                                        self.draw_stroke_decorations(
                                            shape,
                                            &shape_layer.strokes,
                                            shape_layer.stroke_width,
                                            shape_layer.stroke_decoration_start,
                                            shape_layer.stroke_decoration_end,
                                        );
                                    }
                                });
                            };
                            self.with_optional_clip_path(clip_path.as_ref(), || {
                                self.draw_shape_with_effects(effect_ref, shape, draw_content);
                            });
                        });
                    },
                );
            }
            PainterPictureLayer::Text(text_layer) => {
                self.with_blendmode(
                    text_layer.base.blend_mode,
                    &text_layer.shape,
                    &text_layer.effects,
                    &text_layer.base.transform.matrix,
                    || {
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
                                    // Allow stroke-only text: paragraph paint may be empty, but we can still draw strokes.
                                    if text_layer.fills.is_empty()
                                        && (text_layer.strokes.is_empty()
                                            || text_layer.stroke_width <= 0.0)
                                    {
                                        return;
                                    }
                                    self.draw_text_paragraph(
                                        &paragraph,
                                        if self.policy.render_strokes() {
                                            &text_layer.strokes
                                        } else {
                                            &[]
                                        },
                                        if self.policy.render_strokes() {
                                            text_layer.stroke_width
                                        } else {
                                            0.0
                                        },
                                        &text_layer.stroke_align,
                                        (layout_size.0, container_height),
                                        y_offset,
                                        self.policy.render_fills(),
                                    );
                                });
                            };

                            let apply_effects = || {
                                if let Some(blur) = &effects.backdrop_blur {
                                    self.draw_text_backdrop_blur(&paragraph, &blur.blur, y_offset);
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
                                if let Some(layer_blur) = &effects.blur {
                                    let text_bounds = Rect::from_xywh(
                                        0.0,
                                        y_offset,
                                        layout_size.0,
                                        container_height,
                                    );
                                    self.with_layer_blur(
                                        &layer_blur.blur,
                                        text_bounds,
                                        apply_effects,
                                    );
                                } else {
                                    apply_effects();
                                }
                            };

                            self.with_optional_clip_path(clip_path.as_ref(), || {
                                draw_with_effects();
                            });
                        });
                    },
                );
            }
            PainterPictureLayer::Vector(vector_layer) => {
                self.with_blendmode(
                    vector_layer.base.blend_mode,
                    &vector_layer.shape,
                    &vector_layer.effects,
                    &vector_layer.base.transform.matrix,
                    || {
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

                                    if self.policy.render_fills() {
                                        // 1. Render fills only (pass None for strokes)
                                        vn_painter.draw(
                                            &vector_layer.vector,
                                            &vector_layer.fills,
                                            None,
                                            vector_layer.corner_radius,
                                        );

                                        // 2. Apply noise effects (only if fills are visible)
                                        if !vector_layer.fills.is_empty()
                                            && !effect_ref.noises.is_empty()
                                        {
                                            self.draw_noise_effects(shape, &effect_ref.noises);
                                        }
                                    }

                                    if self.policy.render_strokes() {
                                        let has_cutback =
                                            vector_layer.stroke_decoration_start.has_marker()
                                                || vector_layer.stroke_decoration_end.has_marker();

                                        let start_cutback = crate::shape::marker::cutback_depth(
                                            vector_layer.stroke_decoration_start,
                                            vector_layer.stroke_width,
                                        );
                                        let end_cutback = crate::shape::marker::cutback_depth(
                                            vector_layer.stroke_decoration_end,
                                            vector_layer.stroke_width,
                                        );
                                        let needs_trim =
                                            start_cutback > 0.0 || end_cutback > 0.0;

                                        // Force Butt cap when decorations are present so the
                                        // native cap doesn't leak out from under the marker.
                                        let effective_cap = if has_cutback {
                                            StrokeCap::Butt
                                        } else {
                                            vector_layer.stroke_cap
                                        };

                                        // 3. Render strokes (trimmed when cutback applies)
                                        if !vector_layer.strokes.is_empty() {
                                            if needs_trim {
                                                // When cutback is needed, get the VN path, trim it,
                                                // and stroke via stroke_geometry instead of VNPainter.
                                                let paths = vector_layer.vector.to_paths();
                                                if let Some(vn_path) = paths.first() {
                                                    let trimmed =
                                                        crate::shape::marker::trim_path(
                                                            vn_path,
                                                            start_cutback,
                                                            end_cutback,
                                                        );
                                                    let stroke_path =
                                                        crate::shape::stroke::stroke_geometry(
                                                            &trimmed,
                                                            vector_layer.stroke_width,
                                                            vector_layer.stroke_align,
                                                            effective_cap,
                                                            vector_layer.stroke_join,
                                                            vector_layer.stroke_miter_limit,
                                                            vector_layer
                                                                .stroke_dash_array
                                                                .as_ref(),
                                                        );
                                                    self.draw_stroke_path(
                                                        shape,
                                                        &stroke_path,
                                                        &vector_layer.strokes,
                                                    );
                                                }
                                            } else {
                                                // No cutback: use VNPainter for full-fidelity rendering
                                                let stroke_options = StrokeOptions {
                                                    stroke_width: vector_layer.stroke_width,
                                                    stroke_align: vector_layer.stroke_align,
                                                    stroke_cap: effective_cap,
                                                    stroke_join: vector_layer.stroke_join,
                                                    stroke_miter_limit: vector_layer
                                                        .stroke_miter_limit,
                                                    paints: vector_layer.strokes.clone(),
                                                    width_profile: vector_layer
                                                        .stroke_width_profile
                                                        .clone(),
                                                    stroke_dash_array: vector_layer
                                                        .stroke_dash_array
                                                        .clone(),
                                                };
                                                self.draw_vector_strokes(
                                                    &vn_painter,
                                                    &vector_layer.vector,
                                                    &stroke_options,
                                                    vector_layer.corner_radius,
                                                );
                                            }
                                        }

                                        // 4. Stroke decorations (markers at endpoints)
                                        // Place markers on the UNTRIMMED path so tips align
                                        // with the logical endpoint.
                                        if has_cutback {
                                            let paths = vector_layer.vector.to_paths();
                                            if let Some(vn_path) = paths.first() {
                                                if let Some(sk_paint) = paint::sk_paint_stack(
                                                    &vector_layer.strokes,
                                                    (shape.rect.width(), shape.rect.height()),
                                                    self.images,
                                                ) {
                                                    crate::shape::marker::draw_endpoint_decorations(
                                                        self.canvas,
                                                        vn_path,
                                                        vector_layer.stroke_decoration_start,
                                                        vector_layer.stroke_decoration_end,
                                                        vector_layer.stroke_width,
                                                        &sk_paint,
                                                    );
                                                }
                                            }
                                        }
                                    }
                                });
                            };
                            self.with_optional_clip_path(clip_path.as_ref(), || {
                                self.draw_shape_with_effects(effect_ref, shape, draw_content);
                            });
                        });
                    },
                );
            }
        }
    }

    fn outline_sk_paint(&self, style: OutlineStyle) -> SkPaint {
        let mut paint = SkPaint::default();
        let color: skia_safe::Color = style.color.into();
        paint.set_color(color);
        paint.set_style(skia_safe::paint::Style::Stroke);
        paint.set_stroke_width(style.width);
        paint.set_anti_alias(true);
        paint
    }

    fn draw_layer_outline(&self, layer: &PainterPictureLayer, style: OutlineStyle) {
        match layer {
            PainterPictureLayer::Shape(shape_layer) => {
                self.canvas.save();
                self.canvas
                    .concat(&sk::sk_matrix(shape_layer.base.transform.matrix));
                self.with_optional_clip_path(shape_layer.base.clip_path.as_ref(), || {
                    let path = shape_layer.shape.to_path();
                    let paint = self.outline_sk_paint(style);
                    self.canvas.draw_path(&path, &paint);
                });
                self.canvas.restore();
            }
            PainterPictureLayer::Vector(vector_layer) => {
                self.canvas.save();
                self.canvas
                    .concat(&sk::sk_matrix(vector_layer.base.transform.matrix));
                self.with_optional_clip_path(vector_layer.base.clip_path.as_ref(), || {
                    let vn_painter = crate::vectornetwork::vn_painter::VNPainter::new_with_images(
                        self.canvas,
                        self.images,
                    );

                    let stroke_options = StrokeOptions {
                        stroke_width: style.width,
                        stroke_align: StrokeAlign::Center,
                        stroke_cap: StrokeCap::Butt,
                        stroke_join: StrokeJoin::Miter,
                        stroke_miter_limit: crate::cg::types::StrokeMiterLimit(4.0),
                        paints: crate::cg::types::Paints::new([crate::cg::types::Paint::Solid(
                            crate::cg::types::SolidPaint {
                                color: style.color,
                                blend_mode: Default::default(),
                                active: true,
                            },
                        )]),
                        width_profile: None,
                        stroke_dash_array: None,
                    };

                    self.draw_vector_strokes(
                        &vn_painter,
                        &vector_layer.vector,
                        &stroke_options,
                        vector_layer.corner_radius,
                    );
                });
                self.canvas.restore();
            }
            PainterPictureLayer::Text(text_layer) => {
                self.canvas.save();
                self.canvas
                    .concat(&sk::sk_matrix(text_layer.base.transform.matrix));
                self.with_optional_clip_path(text_layer.base.clip_path.as_ref(), || {
                    // Ensure we can shape text even when fills are empty.
                    let fills: crate::cg::types::Paints = if text_layer.fills.is_empty() {
                        crate::cg::types::Paints::new([crate::cg::types::Paint::Solid(
                            crate::cg::types::SolidPaint {
                                color: crate::cg::color::CGColor::TRANSPARENT,
                                blend_mode: Default::default(),
                                active: true,
                            },
                        )])
                    } else {
                        text_layer.fills.clone()
                    };

                    let paragraph = self.cached_paragraph(
                        &text_layer.base.id,
                        &text_layer.text,
                        &text_layer.width,
                        &text_layer.max_lines,
                        &text_layer.ellipsis,
                        &fills,
                        &text_layer.text_align,
                        &text_layer.text_align_vertical,
                        &text_layer.text_style,
                    );

                    let layout_size = {
                        let para = paragraph.borrow();
                        (para.max_width(), para.height())
                    };

                    let layout_height = layout_size.1;
                    let y_offset = match text_layer.height {
                        Some(h) => match text_layer.text_align_vertical {
                            TextAlignVertical::Top => 0.0,
                            TextAlignVertical::Center => (h - layout_height) / 2.0,
                            TextAlignVertical::Bottom => h - layout_height,
                        },
                        None => 0.0,
                    };

                    let glyph_path = self.build_text_glyph_path(&paragraph, y_offset);
                    if !glyph_path.is_empty() {
                        let paint = self.outline_sk_paint(style);
                        self.canvas.draw_path(&glyph_path, &paint);
                    }
                });
                self.canvas.restore();
            }
        }
    }

    fn build_text_glyph_path(
        &self,
        paragraph: &Rc<RefCell<textlayout::Paragraph>>,
        y_offset: f32,
    ) -> Path {
        let mut builder = PathBuilder::new();
        paragraph.borrow_mut().visit(|_, info| {
            if let Some(info) = info {
                let glyphs = info.glyphs();
                let positions = info.positions();
                let origin = info.origin();
                let font = info.font();
                for (glyph, pos) in glyphs.iter().zip(positions.iter()) {
                    if let Some(glyph_path) = font.get_path(*glyph) {
                        let offset = Point::new(pos.x + origin.x, pos.y + origin.y + y_offset);
                        if offset.x != 0.0 || offset.y != 0.0 {
                            let transformed =
                                glyph_path.make_transform(&Matrix::translate((offset.x, offset.y)));
                            builder.add_path(&transformed);
                        } else {
                            builder.add_path(&glyph_path);
                        }
                    }
                }
            }
        });
        builder.detach()
    }

    fn draw_render_commands(&self, commands: &[PainterRenderCommand]) {
        for command in commands {
            match command {
                PainterRenderCommand::Draw(layer) => {
                    // Prefer cached picture if available
                    if let Some(scene_cache) = self.scene_cache {
                        if let Some(pic) =
                            scene_cache.get_node_picture_variant(layer.id(), self.variant_key)
                        {
                            self.canvas.draw_picture(pic, None, None);
                            *self.cache_hits.borrow_mut() += 1;
                            continue;
                        }
                    }
                    self.draw_layer(layer)
                }
                PainterRenderCommand::MaskGroup(group) => {
                    self.draw_mask_group_or_passthrough(group)
                }
            }
        }
    }

    fn draw_mask_group(&self, group: &PainterMaskGroup) {
        match group.mask_type {
            LayerMaskType::Geometry => self.draw_geometry_mask_group(group),
            LayerMaskType::Image(image_mask) => self.draw_image_mask_group(group, image_mask),
        }
    }

    fn draw_geometry_mask_group(&self, group: &PainterMaskGroup) {
        let mut clip_path = Path::new();
        self.collect_mask_paths_for_masks(&group.mask_commands, &mut clip_path);
        if clip_path.is_empty() {
            return;
        }

        self.canvas.save();
        self.canvas.clip_path(&clip_path, None, true);
        self.draw_render_commands(&group.content_commands);
        self.canvas.restore();
    }

    fn draw_image_mask_group(&self, group: &PainterMaskGroup, mask_type: ImageMaskType) {
        self.canvas.save_layer(&SaveLayerRec::default());
        self.draw_render_commands(&group.content_commands);

        let mut paint = SkPaint::default();
        paint.set_blend_mode(skia_safe::BlendMode::DstIn);

        if let ImageMaskType::Luminance = mask_type {
            // Use Skia-safe's built-in luma color filter constructor
            paint.set_color_filter(skia_safe::luma_color_filter::new());
        }

        self.canvas
            .save_layer(&SaveLayerRec::default().paint(&paint));
        self.draw_render_commands(&group.mask_commands);
        self.canvas.restore();
        self.canvas.restore();
    }

    /// Collect only mask geometry paths (ignoring content of nested groups).
    fn collect_mask_paths_for_masks(&self, commands: &[PainterRenderCommand], out_path: &mut Path) {
        let mut builder = PathBuilder::new_path(out_path);
        for command in commands {
            match command {
                PainterRenderCommand::Draw(layer) => {
                    if let Some(layer_path) = Self::layer_to_path(layer) {
                        builder.add_path(&layer_path);
                    }
                }
                PainterRenderCommand::MaskGroup(group) => {
                    // Recurse only into further mask commands
                    let mut temp_path = builder.detach();
                    self.collect_mask_paths_for_masks(&group.mask_commands, &mut temp_path);
                    builder = PathBuilder::new_path(&temp_path);
                }
            }
        }
        *out_path = builder.detach();
    }

    fn layer_to_path(layer: &PainterPictureLayer) -> Option<Path> {
        let shape = layer.shape();
        let mut path = shape.to_path();
        let transform = layer.transform().matrix;
        path = path.make_transform(&sk::sk_matrix(transform));
        Some(path)
    }

    /// Draw all layers in a [`LayerList`].
    pub fn draw_layer_list(&self, list: &LayerList) {
        if !self.policy.is_wireframe() {
            self.draw_layer_list_standard(list);
        } else {
            self.draw_layer_list_outline(list);
        }
    }

    fn draw_layer_list_standard(&self, list: &LayerList) {
        self.draw_render_commands(&list.commands);
    }

    fn draw_layer_list_outline(&self, list: &LayerList) {
        let Some(style) = self.policy.outline_style() else {
            // Non-standard policy without an outline style: nothing to draw.
            return;
        };

        for entry in &list.layers {
            if let Some(scene_cache) = self.scene_cache {
                if let Some(pic) = scene_cache.get_node_picture_variant(&entry.id, self.variant_key)
                {
                    self.canvas.draw_picture(pic, None, None);
                    *self.cache_hits.borrow_mut() += 1;
                    continue;
                }
            }
            self.draw_layer_outline(&entry.layer, style);
        }
    }

    pub fn cache_picture_hits(&self) -> usize {
        *self.cache_hits.borrow()
    }
}
