use super::effects_noise;
use super::geometry::*;
use super::layer::{
    Layer, LayerList, PainterMaskGroup, PainterPictureLayer, PainterRenderCommand,
    PainterRenderSurface,
};
use super::paint;
use super::shadow;
use super::text_stroke;
use crate::cache::fast_hash::NodeIdHashMap;
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
use std::cell::{Cell, RefCell};
use std::rc::Rc;

/// A compact bitset for O(1) node-visibility queries during drawing.
///
/// Built from the R-tree spatial query results in the frame plan. Nodes
/// whose bit is set are visible; all others are skipped in the draw loop.
///
/// Uses a `Vec<u64>` bitset (8 bytes per 64 nodes) instead of a HashSet
/// for minimal memory and branch-free lookups.
pub struct VisibilitySet {
    /// Bitset: bit `(id % 64)` of `bits[id / 64]` is set when the node is visible.
    bits: Vec<u64>,
}

impl VisibilitySet {
    /// Build from an iterator of visible `NodeId`s.
    pub fn from_ids(ids: impl Iterator<Item = NodeId>) -> Self {
        let mut bits = Vec::new();
        for id in ids {
            let word = id as usize / 64;
            let bit = id as usize % 64;
            if word >= bits.len() {
                bits.resize(word + 1, 0u64);
            }
            bits[word] |= 1u64 << bit;
        }
        Self { bits }
    }

    /// Returns `true` if the node is in the visible set.
    #[inline]
    pub fn contains(&self, id: &NodeId) -> bool {
        let word = *id as usize / 64;
        let bit = *id as usize % 64;
        word < self.bits.len() && (self.bits[word] & (1u64 << bit)) != 0
    }
}

/// Per-frame viewport culling context.
///
/// Encapsulates visibility data from the R-tree spatial query. The Painter
/// uses this to skip off-screen commands during the draw loop — a draw-time
/// optimization that does not modify the cached command tree (LayerList).
///
/// Culling strategy per command type:
/// - `Draw`: O(1) bitset lookup on `visible_leaves`. The R-tree provides
///   effect-expanded bounds so nodes whose effects bleed into viewport are
///   correctly retained.
/// - `RenderSurface`: always drawn. Surface bounds lack surface-level effect
///   inflation (shadow offset, blur radius), making geometric culling unsafe.
/// - `MaskGroup`: always drawn. No bounds available; rare in practice.
///
/// This mirrors Chromium's compositor architecture: the display list is
/// stable and cached; visibility culling is a per-frame draw-time concern.
pub struct ViewportCull {
    /// Bitset of visible leaf NodeIds from R-tree intersection query.
    /// `None` when every leaf in the scene is visible — the bitset is then
    /// unnecessary and [`is_leaf_visible`] short-circuits to `true`.
    visible_leaves: Option<VisibilitySet>,
    /// World-space viewport rectangle. Stored for future use when
    /// RenderSurface bounds include effect inflation.
    #[allow(dead_code)]
    viewport: math2::Rectangle,
}

impl ViewportCull {
    /// Build from a [`FramePlan`] and the scene's [`LayerList`].
    ///
    /// Extracts visible NodeIds from the plan's region indices (live-drawn
    /// nodes) and promoted IDs (compositor-cached nodes), then builds the
    /// compact bitset.
    ///
    /// When every leaf in the scene is visible (count of visible IDs matches
    /// the total layer count), returns an "all-visible" cull that skips the
    /// O(N) bitset construction. On large fit-zoom scenes (100K+ nodes),
    /// this eliminates ~1ms of per-frame allocation + bit-setting work.
    pub fn from_plan(
        plan: &crate::runtime::scene::FramePlan,
        layers: &super::layer::LayerList,
    ) -> Self {
        // Count visible IDs to detect the all-visible fast path. Regions hold
        // the live-drawn indices; promoted IDs are disjoint from live regions
        // (see `draw_layers_with_scene_cache_skip` construction path).
        let live_count: usize = plan.regions.iter().map(|(_, idx)| idx.len()).sum();
        let visible_count = live_count + plan.promoted.len();
        if visible_count >= layers.layers.len() {
            return Self {
                visible_leaves: None,
                viewport: plan.viewport,
            };
        }

        let visible_leaves = VisibilitySet::from_ids(
            plan.regions
                .iter()
                .flat_map(|(_, indices)| {
                    indices
                        .iter()
                        .filter_map(|&idx| layers.layers.get(idx).map(|entry| entry.id))
                })
                .chain(plan.promoted.iter().copied()),
        );
        Self {
            visible_leaves: Some(visible_leaves),
            viewport: plan.viewport,
        }
    }

    /// Returns `true` if the leaf node is visible (in the R-tree result set).
    #[inline]
    pub fn is_leaf_visible(&self, id: &NodeId) -> bool {
        match &self.visible_leaves {
            Some(set) => set.contains(id),
            None => true,
        }
    }
}

/// Pre-extracted blit data for a single promoted (compositor-cached) node.
///
/// Built before the draw pass so that the Painter can blit promoted nodes
/// inline at their correct z-position in the render command tree, instead
/// of batching all promoted blits before live draws (which breaks z-order
/// when a live parent covers its promoted children).
pub struct PromotedBlit {
    /// The cached image to blit (either individual texture or atlas snapshot).
    pub image: Rc<skia_safe::Image>,
    /// Source rectangle within the image (full image for individual, sub-rect for atlas).
    pub src_rect: Rect,
    /// Destination rectangle in world coordinates (the node's render bounds).
    pub dst_rect: Rect,
    /// Opacity to apply when blitting.
    pub opacity: f32,
    /// Blend mode to apply when blitting.
    pub blend_mode: skia_safe::BlendMode,
}

/// A painter that handles all drawing operations for nodes,
/// with proper effect ordering and a layer‐blur/backdrop‐blur pipeline.
pub struct Painter<'a> {
    canvas: &'a skia_safe::Canvas,
    fonts: &'a FontRepository,
    images: &'a ImageRepository,
    path_cache: RefCell<VectorPathCache>,
    scene_cache: Option<&'a SceneCache>,
    cache_hits: Cell<usize>,
    policy: RenderPolicy,
    variant_key: u64,
    /// Pre-computed: true when variant_key != 0 and the policy differs from
    /// STANDARD only in effect-related fields. When true AND a node has empty
    /// effects, the picture cache lookup uses key 0 instead of variant_key.
    can_unify_variant: bool,
    /// Pre-extracted blit data for promoted (compositor-cached) nodes.
    /// When present, promoted nodes are blitted inline at their correct
    /// z-position instead of being skipped.
    promoted_blits: Option<&'a NodeIdHashMap<NodeId, PromotedBlit>>,
    /// Per-frame viewport culling context. When set, the draw loop skips
    /// off-screen `Draw` commands using the bitset built from the R-tree
    /// spatial query. `None` means draw everything (wireframe, tests, etc.).
    viewport_cull: Option<&'a ViewportCull>,
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

    /// Create a new Painter that uses the SceneCache's paragraph cache.
    pub fn new_with_scene_cache(
        canvas: &'a skia_safe::Canvas,
        fonts: &'a FontRepository,
        images: &'a ImageRepository,
        scene_cache: &'a SceneCache,
        policy: RenderPolicy,
    ) -> Self {
        let variant_key = policy.variant_key();
        let can_unify_variant = variant_key != 0 && policy.is_effect_only_variant();
        Self {
            canvas,
            fonts,
            images,
            path_cache: RefCell::new(VectorPathCache::new()),
            scene_cache: Some(scene_cache), // Store reference to scene cache
            cache_hits: Cell::new(0),
            policy,
            variant_key,
            can_unify_variant,
            promoted_blits: None,
            viewport_cull: None,
        }
    }

    /// Set the promoted blit map. Nodes in this map will be blitted from
    /// their pre-extracted compositor cache data at the correct z-position
    /// in the render command tree, instead of being re-drawn live.
    pub fn with_promoted_blits(mut self, blits: &'a NodeIdHashMap<NodeId, PromotedBlit>) -> Self {
        self.promoted_blits = Some(blits);
        self
    }

    /// Set the viewport culling context. When set, the draw loop skips
    /// off-screen `Draw` commands using the R-tree visibility bitset.
    pub fn with_viewport_cull(mut self, cull: &'a ViewportCull) -> Self {
        self.viewport_cull = Some(cull);
        self
    }

    #[cfg(test)]
    pub fn path_cache(&self) -> &RefCell<VectorPathCache> {
        &self.path_cache
    }

    // ============================
    // === Effect Quality (LOD) ==
    // ============================

    /// Returns true if using reduced effect quality (interactive frames).
    #[inline]
    fn is_reduced_quality(&self) -> bool {
        self.policy.effect_quality == crate::runtime::render_policy::EffectQuality::Reduced
    }

    /// Reduce effects for interactive (unstable) frames.
    ///
    /// - Drop shadows: blur → 0 (sharp offset, still visible)
    /// - Inner shadows: removed entirely
    /// - Layer blur: radius / 4
    /// - Noise: removed entirely
    /// - Backdrop blur: radius / 4
    /// - Liquid glass: kept (context-dependent, can't skip cleanly)
    fn reduce_effects(effects: &LayerEffects) -> LayerEffects {
        LayerEffects {
            shadows: effects
                .shadows
                .iter()
                .filter_map(|s| match s {
                    FilterShadowEffect::DropShadow(ds) => {
                        Some(FilterShadowEffect::DropShadow(FeShadow {
                            blur: 0.0,
                            ..*ds
                        }))
                    }
                    // Skip inner shadows entirely — they're expensive and
                    // subtle enough that their absence isn't noticeable during
                    // fast interaction.
                    FilterShadowEffect::InnerShadow(_) => None,
                })
                .collect(),
            blur: effects.blur.as_ref().map(|b| FeLayerBlur {
                active: b.active,
                blur: Self::reduce_blur(&b.blur),
            }),
            backdrop_blur: effects.backdrop_blur.as_ref().map(|b| FeBackdropBlur {
                active: b.active,
                blur: Self::reduce_blur(&b.blur),
            }),
            // Skip noise entirely — it's expensive and purely decorative.
            noises: Vec::new(),
            // Keep glass — it's context-dependent and visually essential.
            glass: effects.glass,
        }
    }

    /// Reduce a blur effect's radius by 4× for interactive frames.
    fn reduce_blur(blur: &FeBlur) -> FeBlur {
        match blur {
            FeBlur::Gaussian(g) => FeBlur::Gaussian(FeGaussianBlur {
                radius: g.radius / 4.0,
            }),
            FeBlur::Progressive(p) => FeBlur::Progressive(FeProgressiveBlur {
                radius: p.radius / 4.0,
                radius2: p.radius2 / 4.0,
                ..*p
            }),
        }
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
        p.set_anti_alias(self.policy.anti_alias());
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

    /// If opacity < 1.0, wrap drawing in a bounded save_layer_alpha; else draw directly.
    ///
    /// Providing tight bounds limits the offscreen GPU buffer to the node's
    /// actual extent instead of the full canvas (~100x smaller). See item 12
    /// in `docs/wg/feat-2d/optimization.md`.
    pub fn with_opacity<F: FnOnce()>(&self, opacity: f32, bounds: Option<&Rect>, f: F) {
        let canvas = self.canvas;
        if opacity < 1.0 {
            canvas.save_layer_alpha(bounds.copied(), (opacity * 255.0) as u32);
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
    /// - stroke_path: Optional stroke path for bounds expansion (Center/Outside strokes)
    ///
    /// When a stroke path extends beyond `shape.rect` (Center or Outside
    /// alignment), the save_layer bounds must include the stroke geometry
    /// to avoid clipping. Without this, `save_layer_alpha` would clip the
    /// outer portion of Center/Outside strokes.
    ///
    /// # TODO: Move to Geometry Stage
    ///
    /// Pre-compute blend mode bounds in the geometry stage (similar to `compute_render_bounds`
    /// in `cache::geometry`). This would unify all geometry computations (world/absolute/local transforms,
    /// render bounds, blend mode isolation bounds) in a single place, ensuring consistency and avoiding
    /// redundant calculations during rendering. The geometry cache already computes `absolute_render_bounds`
    /// which includes effect expansion - blend mode isolation bounds could be added as a separate field
    /// or computed alongside render bounds.
    fn compute_blend_mode_bounds_with_stroke(
        shape: &PainterShape,
        effects: &LayerEffects,
        transform: &[[f32; 3]; 2],
        stroke_path: Option<&skia_safe::Path>,
    ) -> Rect {
        // Start with local bounds (0,0 based)
        let mut local_bounds = shape.rect;

        // Expand for stroke path that extends beyond fill bounds
        if let Some(path) = stroke_path {
            let stroke_bounds = path.bounds();
            local_bounds = Rect::from_ltrb(
                local_bounds.left().min(stroke_bounds.left()),
                local_bounds.top().min(stroke_bounds.top()),
                local_bounds.right().max(stroke_bounds.right()),
                local_bounds.bottom().max(stroke_bounds.bottom()),
            );
        }

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

    /// If blend mode is not PassThrough or Normal, wrap drawing in a bounds-optimized save_layer.
    ///
    /// Performance: Uses bounds-based save_layer to limit offscreen buffer size (~100x smaller).
    ///
    /// **Normal blend mode fast path:** For leaf nodes (Shape, Text, Vector),
    /// `Blend(Normal)` is mathematically equivalent to `PassThrough` because
    /// SrcOver compositing is associative — drawing fills/strokes into an
    /// offscreen then blitting with SrcOver produces identical results to
    /// drawing directly. This method is only called for leaf nodes (not
    /// containers), so we skip the save_layer entirely for Normal blend.
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
        stroke_path: Option<&skia_safe::Path>,
        f: F,
    ) {
        match layer_blend_mode {
            LayerBlendMode::PassThrough | LayerBlendMode::Blend(BlendMode::Normal) => {
                // No isolation needed — draw directly.
                // Normal (SrcOver) on a leaf node is equivalent to PassThrough
                // because there are no children whose blend modes could interact
                // with content beneath the node.
                f();
            }
            LayerBlendMode::Blend(blend_mode) => {
                // Non-Normal blend modes (Multiply, Screen, etc.) need isolation.
                let bounds = Self::compute_blend_mode_bounds_with_stroke(
                    shape,
                    effects,
                    transform,
                    stroke_path,
                );

                let mut paint = SkPaint::default();
                paint.set_blend_mode(blend_mode.into());

                let layer_rec = SaveLayerRec::default().bounds(&bounds).paint(&paint);

                self.canvas.save_layer(&layer_rec);
                f();
                self.canvas.restore();
            }
        }
    }

    /// Combined blend mode + opacity isolation in a single save_layer.
    ///
    /// When a node has no effects that require separate opacity isolation
    /// (no shadows, blur, glass, or backdrop blur), we can merge the
    /// opacity into the blend mode save_layer paint, eliminating one
    /// GPU surface allocation per node.
    ///
    /// For PassThrough and Normal blend modes on leaf nodes, falls back to
    /// save_layer_alpha with bounds optimization (no blend isolation needed).
    fn with_blendmode_and_opacity<F: FnOnce()>(
        &self,
        layer_blend_mode: LayerBlendMode,
        opacity: f32,
        shape: &PainterShape,
        effects: &LayerEffects,
        transform: &[[f32; 3]; 2],
        stroke_path: Option<&skia_safe::Path>,
        f: F,
    ) {
        match layer_blend_mode {
            LayerBlendMode::PassThrough | LayerBlendMode::Blend(BlendMode::Normal) => {
                // Normal (SrcOver) on a leaf node needs no blend isolation.
                // Just apply opacity via save_layer_alpha if needed.
                if opacity < 1.0 {
                    let bounds = Self::compute_blend_mode_bounds_with_stroke(
                        shape,
                        effects,
                        transform,
                        stroke_path,
                    );
                    self.canvas
                        .save_layer_alpha(bounds, (opacity * 255.0) as u32);
                    f();
                    self.canvas.restore();
                } else {
                    f();
                }
            }
            LayerBlendMode::Blend(blend_mode) => {
                // Non-Normal blend modes need isolation.
                let bounds = Self::compute_blend_mode_bounds_with_stroke(
                    shape,
                    effects,
                    transform,
                    stroke_path,
                );

                let mut paint = SkPaint::default();
                paint.set_blend_mode(blend_mode.into());
                // Merge opacity into the blend paint alpha — single GPU surface
                // instead of nested save_layer(blend) + save_layer_alpha(opacity).
                if opacity < 1.0 {
                    paint.set_alpha_f(opacity);
                }

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
        shape.clip_on_canvas(canvas);
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
        paint.set_anti_alias(self.policy.anti_alias());
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
        paint.set_anti_alias(self.policy.anti_alias());
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
            shape.clip_on_canvas(canvas);

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
        shape.clip_on_canvas(canvas);

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
            self.policy.anti_alias(),
        ) {
            shape.draw_on_canvas(self.canvas, &paint);
        }
    }

    /// Draw fills at pre-translated coordinates, avoiding canvas save/concat/restore.
    ///
    /// For pure-translation transforms, this pre-applies the translation to shape
    /// coordinates and draws directly. Reduces the SkPicture from 4 commands
    /// (save + concat + draw + restore) to 1 command (draw) per node.
    #[inline]
    fn draw_fills_translated(&self, shape: &PainterShape, fills: &[Paint], tx: f32, ty: f32) {
        if fills.is_empty() {
            return;
        }
        if let Some(paint) = paint::sk_paint_stack(
            fills,
            (shape.rect.width(), shape.rect.height()),
            self.images,
            self.policy.anti_alias(),
        ) {
            self.draw_shape_at_offset(shape, &paint, tx, ty);
        }
    }

    /// Draw fills at pre-translated coordinates with opacity baked into paint alpha.
    #[inline]
    fn draw_fills_translated_with_opacity(
        &self,
        shape: &PainterShape,
        fills: &[Paint],
        opacity: f32,
        tx: f32,
        ty: f32,
    ) {
        if fills.is_empty() {
            return;
        }
        if let Some(mut paint) = paint::sk_paint_stack(
            fills,
            (shape.rect.width(), shape.rect.height()),
            self.images,
            self.policy.anti_alias(),
        ) {
            paint.set_alpha_f(paint.alpha_f() * opacity);
            self.draw_shape_at_offset(shape, &paint, tx, ty);
        }
    }

    /// Draw a shape at an offset without canvas save/concat/restore.
    ///
    /// For rect, rrect, and oval shapes, translates coordinates directly.
    /// For path shapes, falls back to save/translate/draw/restore.
    ///
    /// When the paint carries a shader (image fill, gradient, etc.), the shader's
    /// local matrix is also translated by `(tx, ty)` so that the texture moves
    /// together with the geometry. Without this, shaders would stay at the
    /// global origin while only the shape rect is offset — causing image fills
    /// to appear "stuck" in world space when a node is translated.
    #[inline]
    fn draw_shape_at_offset(&self, shape: &PainterShape, paint: &SkPaint, tx: f32, ty: f32) {
        if tx == 0.0 && ty == 0.0 {
            shape.draw_on_canvas(self.canvas, paint);
            return;
        }

        // If the paint has a shader (image, gradient, etc.), translate its
        // local matrix so the texture moves with the geometry.
        let translated_paint;
        let paint = if let Some(shader) = paint.shader() {
            let m = skia_safe::Matrix::translate((tx, ty));
            translated_paint = {
                let mut p = paint.clone();
                p.set_shader(shader.with_local_matrix(&m));
                p
            };
            &translated_paint
        } else {
            paint
        };

        if let Some(rect) = shape.rect_shape {
            self.canvas.draw_rect(rect.with_offset((tx, ty)), paint);
        } else if let Some(rrect) = &shape.rrect {
            self.canvas.draw_rrect(rrect.with_offset((tx, ty)), paint);
        } else if let Some(oval) = &shape.oval {
            self.canvas.draw_oval(oval.with_offset((tx, ty)), paint);
        } else {
            // Path: use save/translate/draw/restore
            self.canvas.save();
            self.canvas.translate((tx, ty));
            shape.draw_on_canvas(self.canvas, paint);
            self.canvas.restore();
        }
    }

    /// Draw fills with layer opacity baked into the paint alpha.
    ///
    /// Eliminates the save_layer_alpha GPU surface allocation for fills-only
    /// leaf nodes. The opacity is multiplied into the paint's alpha channel,
    /// producing identical results to wrapping in save_layer_alpha when there
    /// is only a single draw call (no strokes overlapping fills).
    #[inline]
    fn draw_fills_with_opacity(&self, shape: &PainterShape, fills: &[Paint], opacity: f32) {
        if fills.is_empty() {
            return;
        }
        if let Some(mut paint) = paint::sk_paint_stack(
            fills,
            (shape.rect.width(), shape.rect.height()),
            self.images,
            self.policy.anti_alias(),
        ) {
            paint.set_alpha_f(paint.alpha_f() * opacity);
            shape.draw_on_canvas(self.canvas, &paint);
        }
    }

    /// Draw fills using a custom path (instead of `shape.to_path()`) with opacity.
    ///
    /// Used for the non-overlapping fill path optimization: when stroke overlaps
    /// fill (Inside/Center), we draw fills using a path with the stroke region
    /// subtracted (PathOp::Difference). This eliminates the overlap, allowing
    /// per-paint-alpha opacity folding without double-blending artifacts.
    fn draw_path_fills_with_opacity(
        &self,
        path: &skia_safe::Path,
        shape: &PainterShape,
        fills: &[Paint],
        opacity: f32,
    ) {
        if fills.is_empty() {
            return;
        }
        if let Some(mut paint) = paint::sk_paint_stack(
            fills,
            (shape.rect.width(), shape.rect.height()),
            self.images,
            self.policy.anti_alias(),
        ) {
            paint.set_alpha_f(paint.alpha_f() * opacity);
            self.canvas.draw_path(path, &paint);
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
            self.policy.anti_alias(),
        ) {
            self.canvas.draw_path(stroke_path, &paint);
        }
    }

    /// Draw stroke path with layer opacity baked into the paint alpha.
    #[inline]
    fn draw_stroke_path_with_opacity(
        &self,
        shape: &PainterShape,
        stroke_path: &skia_safe::Path,
        strokes: &[Paint],
        opacity: f32,
    ) {
        if strokes.is_empty() {
            return;
        }
        if let Some(mut paint) = paint::sk_paint_stack(
            strokes,
            (shape.rect.width(), shape.rect.height()),
            self.images,
            self.policy.anti_alias(),
        ) {
            paint.set_alpha_f(paint.alpha_f() * opacity);
            self.canvas.draw_path(stroke_path, &paint);
        }
    }

    /// Draw stroke decoration markers at the start/end endpoints of a path.
    pub fn draw_stroke_decorations(
        &self,
        shape: &PainterShape,
        strokes: &[Paint],
        stroke_width: f32,
        start: StrokeMarkerPreset,
        end: StrokeMarkerPreset,
    ) {
        if !start.has_marker() && !end.has_marker() {
            return;
        }
        if let Some(sk_paint) = paint::sk_paint_stack(
            strokes,
            (shape.rect.width(), shape.rect.height()),
            self.images,
            self.policy.anti_alias(),
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
        // Apply effect quality reduction for interactive frames.
        let reduced;
        let effects = if self.is_reduced_quality() {
            reduced = Self::reduce_effects(effects);
            &reduced
        } else {
            effects
        };

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

    #[allow(clippy::too_many_arguments)]
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
                let effects = &shape_layer.effects;
                let opacity = shape_layer.base.opacity;

                // Trivial-node fast path: opacity=1.0, no effects, Normal/PassThrough blend.
                // Skips the entire effects pipeline, blend wrapper, opacity wrapper,
                // and all associated condition checks / closure creation.
                // This is the most common case for simple fill/stroke nodes.
                if opacity >= 1.0
                    && effects.is_empty()
                    && matches!(
                        shape_layer.base.blend_mode,
                        LayerBlendMode::PassThrough | LayerBlendMode::Blend(BlendMode::Normal)
                    )
                {
                    let m = &shape_layer.base.transform.matrix;

                    // Translate-fold fast path: for pure-translation transforms with
                    // no clip path and no strokes, pre-apply the translation to shape
                    // coordinates instead of save/concat(matrix)/restore. This reduces
                    // the recorded SkPicture from 4 commands to 1 per node.
                    //
                    // Only applies to fills-only nodes: when strokes are present, the
                    // shared save/concat/restore wrapping both fills and strokes is
                    // cheaper than splitting into separate draw + save/translate/restore.
                    if shape_layer.base.clip_path.is_none()
                        && shape_layer.stroke_path.is_none()
                        && m[0][0] == 1.0
                        && m[1][0] == 0.0
                        && m[0][1] == 0.0
                        && m[1][1] == 1.0
                    {
                        let tx = m[0][2];
                        let ty = m[1][2];
                        if self.policy.render_fills() {
                            self.draw_fills_translated(
                                &shape_layer.shape,
                                &shape_layer.fills,
                                tx,
                                ty,
                            );
                        }
                        return;
                    }

                    self.with_transform(&shape_layer.base.transform.matrix, || {
                        let shape = &shape_layer.shape;
                        let clip_path = &shape_layer.base.clip_path;
                        self.with_optional_clip_path(clip_path.as_ref(), || {
                            if self.policy.render_fills() {
                                self.draw_fills(shape, &shape_layer.fills);
                            }
                            if self.policy.render_strokes() {
                                if let Some(path) = &shape_layer.stroke_path {
                                    self.draw_stroke_path(shape, path, &shape_layer.strokes);
                                }
                            }
                        });
                    });
                    return;
                }

                let can_fold_opacity = opacity < 1.0 && !effects.needs_opacity_isolation();

                // Paint-alpha fast path: for simple leaf nodes with
                // PassThrough/Normal blend and no effects, fold opacity directly
                // into each paint's alpha — zero GPU surface allocations.
                //
                // This eliminates save_layer_alpha, which is the #1 GPU bottleneck
                // for semi-transparent scenes during panning.
                //
                // Per the SVG/CSS spec (and Chromium's implementation), node-level
                // opacity requires group isolation: fill+stroke are drawn at full
                // opacity into an offscreen surface, then composited at the node's
                // opacity. Per-paint alpha is only spec-correct when there is no
                // geometric overlap between fill and stroke.
                //
                // When stroke overlaps fill (Inside/Center), we use a pre-computed
                // non-overlapping fill path (fill minus stroke via PathOp::Difference)
                // to eliminate the overlap at zero GPU cost. If that path is
                // unavailable (PathOp failed), we fall back to save_layer_alpha
                // with bounds expanded to include the stroke path.
                // See docs/wg/feat-2d/stroke-fill-opacity.md
                let has_noises = !shape_layer.fills.is_empty() && !effects.noises.is_empty();
                let is_simple_blend = matches!(
                    shape_layer.base.blend_mode,
                    LayerBlendMode::PassThrough | LayerBlendMode::Blend(BlendMode::Normal)
                );
                let has_stroke_fill_overlap = shape_layer.stroke_overlaps_fill
                    && !shape_layer.fills.is_empty()
                    && !shape_layer.strokes.is_empty();
                let has_non_overlapping_fill = shape_layer.non_overlapping_fill_path.is_some();
                let can_fold_into_paint = can_fold_opacity
                    && is_simple_blend
                    && !has_noises
                    && !effects.has_expensive_effects()
                    && (!has_stroke_fill_overlap || has_non_overlapping_fill);

                if can_fold_into_paint {
                    // Zero save_layers: opacity folded into paint alpha.
                    let m = &shape_layer.base.transform.matrix;

                    // Translate-fold: skip save/concat/restore for pure translations.
                    // Fall through to the normal path when stroke markers are
                    // present — draw_stroke_decorations requires the full
                    // transform context.
                    let has_markers = shape_layer.marker_start_shape.has_marker()
                        || shape_layer.marker_end_shape.has_marker();
                    if shape_layer.base.clip_path.is_none()
                        && shape_layer.non_overlapping_fill_path.is_none()
                        && !has_markers
                        && m[0][0] == 1.0
                        && m[1][0] == 0.0
                        && m[0][1] == 0.0
                        && m[1][1] == 1.0
                    {
                        let tx = m[0][2];
                        let ty = m[1][2];
                        if self.policy.render_fills() {
                            self.draw_fills_translated_with_opacity(
                                &shape_layer.shape,
                                &shape_layer.fills,
                                opacity,
                                tx,
                                ty,
                            );
                        }
                        if self.policy.render_strokes() {
                            if let Some(path) = &shape_layer.stroke_path {
                                if tx == 0.0 && ty == 0.0 {
                                    self.draw_stroke_path_with_opacity(
                                        &shape_layer.shape,
                                        path,
                                        &shape_layer.strokes,
                                        opacity,
                                    );
                                } else {
                                    self.canvas.save();
                                    self.canvas.translate((tx, ty));
                                    self.draw_stroke_path_with_opacity(
                                        &shape_layer.shape,
                                        path,
                                        &shape_layer.strokes,
                                        opacity,
                                    );
                                    self.canvas.restore();
                                }
                            }
                        }
                        return;
                    }

                    self.with_transform(&shape_layer.base.transform.matrix, || {
                        let shape = &shape_layer.shape;
                        let clip_path = &shape_layer.base.clip_path;
                        self.with_optional_clip_path(clip_path.as_ref(), || {
                            if self.policy.render_fills() {
                                // When stroke overlaps fill, use the pre-computed
                                // non-overlapping fill path to avoid double-blending.
                                if let Some(ref nof_path) = shape_layer.non_overlapping_fill_path {
                                    self.draw_path_fills_with_opacity(
                                        nof_path,
                                        shape,
                                        &shape_layer.fills,
                                        opacity,
                                    );
                                } else {
                                    self.draw_fills_with_opacity(
                                        shape,
                                        &shape_layer.fills,
                                        opacity,
                                    );
                                }
                            }
                            if self.policy.render_strokes() {
                                if let Some(path) = &shape_layer.stroke_path {
                                    self.draw_stroke_path_with_opacity(
                                        shape,
                                        path,
                                        &shape_layer.strokes,
                                        opacity,
                                    );
                                }
                                self.draw_stroke_decorations(
                                    shape,
                                    &shape_layer.strokes,
                                    shape_layer.stroke_width,
                                    shape_layer.marker_start_shape,
                                    shape_layer.marker_end_shape,
                                );
                            }
                        });
                    });
                    return;
                }

                let blend_wrapper = |f: &dyn Fn()| {
                    if can_fold_opacity {
                        // Merged path: single save_layer with blend + opacity
                        self.with_blendmode_and_opacity(
                            shape_layer.base.blend_mode,
                            opacity,
                            &shape_layer.shape,
                            effects,
                            &shape_layer.base.transform.matrix,
                            shape_layer.stroke_path.as_ref(),
                            f,
                        );
                    } else {
                        // Standard path: separate blend + opacity save_layers
                        self.with_blendmode(
                            shape_layer.base.blend_mode,
                            &shape_layer.shape,
                            effects,
                            &shape_layer.base.transform.matrix,
                            shape_layer.stroke_path.as_ref(),
                            f,
                        );
                    }
                };

                blend_wrapper(&|| {
                    self.with_transform(&shape_layer.base.transform.matrix, || {
                        let shape = &shape_layer.shape;
                        let effect_ref = &shape_layer.effects;
                        let clip_path = &shape_layer.base.clip_path;
                        let draw_content = || {
                            let inner_draw = || {
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
                                        self.draw_stroke_path(shape, path, &shape_layer.strokes);
                                    }

                                    // 4. Stroke decorations (markers at endpoints)
                                    self.draw_stroke_decorations(
                                        shape,
                                        &shape_layer.strokes,
                                        shape_layer.stroke_width,
                                        shape_layer.marker_start_shape,
                                        shape_layer.marker_end_shape,
                                    );
                                }
                            };
                            if can_fold_opacity {
                                inner_draw();
                            } else {
                                // Compute tight local bounds for the opacity
                                // save_layer: shape rect expanded by stroke path.
                                let mut local_bounds = shape.rect;
                                if let Some(sp) = &shape_layer.stroke_path {
                                    let sb = sp.bounds();
                                    local_bounds = Rect::from_ltrb(
                                        local_bounds.left().min(sb.left()),
                                        local_bounds.top().min(sb.top()),
                                        local_bounds.right().max(sb.right()),
                                        local_bounds.bottom().max(sb.bottom()),
                                    );
                                }
                                self.with_opacity(opacity, Some(&local_bounds), inner_draw);
                            }
                        };
                        self.with_optional_clip_path(clip_path.as_ref(), || {
                            self.draw_shape_with_effects(effect_ref, shape, draw_content);
                        });
                    });
                });
            }
            PainterPictureLayer::Text(text_layer) => {
                let text_effects = &text_layer.effects;
                let text_opacity = text_layer.base.opacity;
                let text_can_fold = text_opacity < 1.0 && !text_effects.needs_opacity_isolation();

                let text_blend_wrapper = |f: &dyn Fn()| {
                    if text_can_fold {
                        self.with_blendmode_and_opacity(
                            text_layer.base.blend_mode,
                            text_opacity,
                            &text_layer.shape,
                            text_effects,
                            &text_layer.base.transform.matrix,
                            None,
                            f,
                        );
                    } else {
                        self.with_blendmode(
                            text_layer.base.blend_mode,
                            &text_layer.shape,
                            text_effects,
                            &text_layer.base.transform.matrix,
                            None,
                            f,
                        );
                    }
                };

                text_blend_wrapper(&|| {
                    self.with_transform(&text_layer.base.transform.matrix, || {
                        let effects = &text_layer.effects;
                        let clip_path = &text_layer.base.clip_path;

                        // Attributed text: build per-run paragraph set, then
                        // feed into the same effect pipeline as uniform text.
                        if let Some(ref attr) = text_layer.attributed_string {
                            use crate::text::attributed_paragraph::build_attributed_paragraph_with_images;
                            let layout_width = text_layer.width.unwrap_or(f32::MAX);

                            // Ensure a measurement paragraph is cached so that
                            // devtools overlays (baseline highlight) can look it up.
                            if let Some(sc) = self.scene_cache {
                                sc.paragraph.borrow_mut().measure_attributed(
                                    attr,
                                    &text_layer.text_align,
                                    &text_layer.max_lines,
                                    &text_layer.ellipsis.clone(),
                                    text_layer.width,
                                    self.fonts,
                                    Some(&text_layer.id),
                                );
                            }
                            let para_set = build_attributed_paragraph_with_images(
                                attr,
                                text_layer.text_align,
                                text_layer.max_lines,
                                text_layer.ellipsis.as_deref(),
                                self.fonts,
                                layout_width,
                                &text_layer.fills,
                                Some(self.images),
                            );
                            let layout_height = para_set.height();
                            let layout_width = para_set.fill.max_width();
                            let container_height = text_layer.height.unwrap_or(layout_height);
                            let y_offset = match text_layer.height {
                                Some(h) => match text_layer.text_align_vertical {
                                    TextAlignVertical::Top => 0.0,
                                    TextAlignVertical::Center => (h - layout_height) / 2.0,
                                    TextAlignVertical::Bottom => h - layout_height,
                                },
                                None => 0.0,
                            };

                            // Wrap fill paragraph for shadow/blur compatibility.
                            let fill_rc = Rc::new(RefCell::new(para_set.fill));

                            let draw_content = || {
                                let inner = || {
                                    self.canvas.save();
                                    self.canvas.translate((0.0, y_offset));
                                    // Stroke paragraph (behind fill)
                                    if let Some(ref stroke) = para_set.stroke {
                                        stroke.paint(self.canvas, skia_safe::Point::new(0.0, 0.0));
                                    }
                                    // Fill paragraph
                                    fill_rc.borrow().paint(self.canvas, skia_safe::Point::new(0.0, 0.0));
                                    self.canvas.restore();
                                };
                                if text_can_fold {
                                    inner();
                                } else {
                                    let text_bounds = Rect::from_xywh(0.0, y_offset, layout_width, container_height);
                                    self.with_opacity(text_opacity, Some(&text_bounds), inner);
                                }
                            };

                            let apply_effects = || {
                                if let Some(blur) = &effects.backdrop_blur {
                                    self.draw_text_backdrop_blur(&fill_rc, &blur.blur, y_offset);
                                }
                                for shadow in &effects.shadows {
                                    if let FilterShadowEffect::DropShadow(ds) = shadow {
                                        self.draw_text_shadow(&fill_rc, ds, y_offset);
                                    }
                                }
                                draw_content();
                                for shadow in &effects.shadows {
                                    if let FilterShadowEffect::InnerShadow(is) = shadow {
                                        self.draw_text_inner_shadow(&fill_rc, is, y_offset);
                                    }
                                }
                            };

                            let draw_with_effects = || {
                                if let Some(layer_blur) = &effects.blur {
                                    let text_bounds = Rect::from_xywh(0.0, y_offset, layout_width, container_height);
                                    self.with_layer_blur(&layer_blur.blur, text_bounds, apply_effects);
                                } else {
                                    apply_effects();
                                }
                            };

                            self.with_optional_clip_path(clip_path.as_ref(), draw_with_effects);
                            return;
                        }

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
                            let inner_text_draw = || {
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
                            };
                            if text_can_fold {
                                inner_text_draw();
                            } else {
                                let text_bounds = Rect::from_xywh(
                                    0.0,
                                    y_offset,
                                    layout_size.0,
                                    container_height,
                                );
                                self.with_opacity(
                                    text_opacity,
                                    Some(&text_bounds),
                                    inner_text_draw,
                                );
                            }
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
                });
            }
            PainterPictureLayer::Vector(vector_layer) => {
                let vec_effects = &vector_layer.effects;
                let vec_opacity = vector_layer.base.opacity;
                let vec_can_fold = vec_opacity < 1.0 && !vec_effects.needs_opacity_isolation();

                let vec_blend_wrapper = |f: &dyn Fn()| {
                    if vec_can_fold {
                        self.with_blendmode_and_opacity(
                            vector_layer.base.blend_mode,
                            vec_opacity,
                            &vector_layer.shape,
                            vec_effects,
                            &vector_layer.base.transform.matrix,
                            None,
                            f,
                        );
                    } else {
                        self.with_blendmode(
                            vector_layer.base.blend_mode,
                            &vector_layer.shape,
                            vec_effects,
                            &vector_layer.base.transform.matrix,
                            None,
                            f,
                        );
                    }
                };

                vec_blend_wrapper(&|| {
                    self.with_transform(&vector_layer.base.transform.matrix, || {
                        let shape = &vector_layer.shape;
                        let effect_ref = &vector_layer.effects;
                        let clip_path = &vector_layer.base.clip_path;
                        let draw_content = || {
                            let inner_vec_draw = || {
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
                                    let has_cutback = vector_layer.marker_start_shape.has_marker()
                                        || vector_layer.marker_end_shape.has_marker();

                                    let start_cutback = crate::shape::marker::cutback_depth(
                                        vector_layer.marker_start_shape,
                                        vector_layer.stroke_width,
                                    );
                                    let end_cutback = crate::shape::marker::cutback_depth(
                                        vector_layer.marker_end_shape,
                                        vector_layer.stroke_width,
                                    );
                                    let needs_trim = start_cutback > 0.0 || end_cutback > 0.0;

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
                                                let trimmed = crate::shape::marker::trim_path(
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
                                                        vector_layer.stroke_dash_array.as_ref(),
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
                                                stroke_miter_limit: vector_layer.stroke_miter_limit,
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
                                                self.policy.anti_alias(),
                                            ) {
                                                crate::shape::marker::draw_endpoint_decorations(
                                                    self.canvas,
                                                    vn_path,
                                                    vector_layer.marker_start_shape,
                                                    vector_layer.marker_end_shape,
                                                    vector_layer.stroke_width,
                                                    &sk_paint,
                                                );
                                            }
                                        }
                                    }
                                }
                            };
                            if vec_can_fold {
                                inner_vec_draw();
                            } else {
                                self.with_opacity(vec_opacity, Some(&shape.rect), inner_vec_draw);
                            }
                        };
                        self.with_optional_clip_path(clip_path.as_ref(), || {
                            self.draw_shape_with_effects(effect_ref, shape, draw_content);
                        });
                    });
                });
            }
            PainterPictureLayer::MarkdownEmbed(md_layer) => {
                let effects = &md_layer.effects;
                let opacity = md_layer.base.opacity;
                let shape = &md_layer.shape;
                let clip_path = &md_layer.base.clip_path;
                let blend_mode = md_layer.base.blend_mode;

                self.with_blendmode(
                    blend_mode,
                    shape,
                    effects,
                    &md_layer.base.transform.matrix,
                    None,
                    || {
                        self.with_transform(&md_layer.base.transform.matrix, || {
                            self.with_optional_clip_path(clip_path.as_ref(), || {
                                let draw_content = || {
                                    // 1. Draw background fills
                                    if self.policy.render_fills() {
                                        self.draw_fills(shape, &md_layer.fills);
                                    }

                                    // 2. Convert markdown → HTML+CSS, render via htmlcss pipeline
                                    let styled_html =
                                        crate::htmlcss::markdown_to_styled_html(&md_layer.markdown);
                                    match crate::htmlcss::render(
                                        &styled_html,
                                        md_layer.width,
                                        md_layer.height,
                                        self.fonts,
                                    ) {
                                        Ok(picture) => {
                                            let cull = picture.cull_rect();
                                            self.canvas.save();
                                            self.canvas.clip_rect(
                                                Rect::from_xywh(
                                                    0.0,
                                                    0.0,
                                                    cull.width(),
                                                    cull.height(),
                                                ),
                                                skia_safe::ClipOp::Intersect,
                                                true,
                                            );
                                            self.canvas.draw_picture(&picture, None, None);
                                            self.canvas.restore();
                                        }
                                        Err(_) => {
                                            // Render error fallback: gray rectangle
                                            let mut paint = SkPaint::default();
                                            paint.set_color(skia_safe::Color::from_rgb(
                                                200, 200, 200,
                                            ));
                                            paint.set_style(skia_safe::PaintStyle::Fill);
                                            self.canvas.draw_rect(
                                                Rect::from_xywh(
                                                    0.0,
                                                    0.0,
                                                    md_layer.width,
                                                    md_layer.height,
                                                ),
                                                &paint,
                                            );
                                        }
                                    }
                                };

                                if opacity >= 1.0 && effects.is_empty() {
                                    draw_content();
                                } else if effects.is_empty() {
                                    self.with_opacity(opacity, Some(&shape.rect), draw_content);
                                } else {
                                    self.draw_shape_with_effects(effects, shape, draw_content);
                                }
                            });
                        });
                    },
                );
            }
            PainterPictureLayer::HtmlEmbed(html_layer) => {
                let effects = &html_layer.effects;
                let opacity = html_layer.base.opacity;
                let shape = &html_layer.shape;
                let clip_path = &html_layer.base.clip_path;
                let blend_mode = html_layer.base.blend_mode;

                self.with_blendmode(
                    blend_mode,
                    shape,
                    effects,
                    &html_layer.base.transform.matrix,
                    None,
                    || {
                        self.with_transform(&html_layer.base.transform.matrix, || {
                            self.with_optional_clip_path(clip_path.as_ref(), || {
                                let draw_content = || {
                                    // 1. Draw background fills
                                    if self.policy.render_fills() {
                                        self.draw_fills(shape, &html_layer.fills);
                                    }

                                    // 2. Render HTML+CSS content as a Picture
                                    match crate::htmlcss::render(
                                        &html_layer.html,
                                        html_layer.width,
                                        html_layer.height,
                                        self.fonts,
                                    ) {
                                        Ok(picture) => {
                                            // Clip to the picture's actual content bounds
                                            let cull = picture.cull_rect();
                                            self.canvas.save();
                                            self.canvas.clip_rect(
                                                Rect::from_xywh(
                                                    0.0,
                                                    0.0,
                                                    cull.width(),
                                                    cull.height(),
                                                ),
                                                skia_safe::ClipOp::Intersect,
                                                true,
                                            );
                                            self.canvas.draw_picture(&picture, None, None);
                                            self.canvas.restore();
                                        }
                                        Err(_) => {
                                            // Render error fallback: gray rectangle
                                            let mut paint = SkPaint::default();
                                            paint.set_color(skia_safe::Color::from_rgb(
                                                200, 200, 200,
                                            ));
                                            paint.set_style(skia_safe::PaintStyle::Fill);
                                            self.canvas.draw_rect(
                                                Rect::from_xywh(
                                                    0.0,
                                                    0.0,
                                                    html_layer.width,
                                                    html_layer.height,
                                                ),
                                                &paint,
                                            );
                                        }
                                    }
                                };

                                if opacity >= 1.0 && effects.is_empty() {
                                    draw_content();
                                } else if effects.is_empty() {
                                    self.with_opacity(opacity, Some(&shape.rect), draw_content);
                                } else {
                                    self.draw_shape_with_effects(effects, shape, draw_content);
                                }
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
        paint.set_anti_alias(self.policy.anti_alias());
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
            PainterPictureLayer::MarkdownEmbed(md_layer) => {
                self.canvas.save();
                self.canvas
                    .concat(&sk::sk_matrix(md_layer.base.transform.matrix));
                self.with_optional_clip_path(md_layer.base.clip_path.as_ref(), || {
                    let path = md_layer.shape.to_path();
                    let paint = self.outline_sk_paint(style);
                    self.canvas.draw_path(&path, &paint);
                });
                self.canvas.restore();
            }
            PainterPictureLayer::HtmlEmbed(html_layer) => {
                self.canvas.save();
                self.canvas
                    .concat(&sk::sk_matrix(html_layer.base.transform.matrix));
                self.with_optional_clip_path(html_layer.base.clip_path.as_ref(), || {
                    let path = html_layer.shape.to_path();
                    let paint = self.outline_sk_paint(style);
                    self.canvas.draw_path(&path, &paint);
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
                    // Leaf culling: skip nodes not in the R-tree visible set.
                    // The bitset lookup (~1ns) eliminates all downstream work:
                    // promoted-blit hashmap lookup, picture cache lookup, and
                    // Skia draw_picture dispatch for off-screen nodes.
                    if let Some(cull) = self.viewport_cull {
                        if !cull.is_leaf_visible(layer.id()) {
                            continue;
                        }
                    }

                    // Blit promoted nodes from the compositor cache inline at
                    // their correct z-position. This preserves z-order when a
                    // live parent (e.g. Container with fills) has promoted
                    // children (e.g. nodes with blur/shadow effects).
                    if let Some(blits) = self.promoted_blits {
                        if let Some(blit) = blits.get(layer.id()) {
                            let mut paint = SkPaint::default();
                            if blit.opacity < 1.0 {
                                paint.set_alpha_f(blit.opacity);
                            }
                            paint.set_blend_mode(blit.blend_mode);
                            self.canvas.draw_image_rect(
                                &*blit.image,
                                Some((&blit.src_rect, skia_safe::canvas::SrcRectConstraint::Fast)),
                                blit.dst_rect,
                                &paint,
                            );
                            continue;
                        }
                    }
                    // Prefer cached picture if available.
                    // Use variant key 0 for effects-free nodes — their pictures
                    // are quality-invariant (see prefill_picture_cache_for_plan).
                    if let Some(scene_cache) = self.scene_cache {
                        let ek = if self.can_unify_variant && layer.effects_empty() {
                            0
                        } else {
                            self.variant_key
                        };
                        if let Some(pic) = scene_cache.get_node_picture_variant(layer.id(), ek) {
                            self.canvas.draw_picture(pic, None, None);
                            self.cache_hits.set(self.cache_hits.get() + 1);
                            continue;
                        }
                    }
                    self.draw_layer(layer)
                }
                PainterRenderCommand::MaskGroup(group) => {
                    self.draw_mask_group_or_passthrough(group)
                }
                PainterRenderCommand::RenderSurface(surface) => self.draw_render_surface(surface),
            }
        }
    }

    /// Draw a render surface: composites children into an offscreen buffer,
    /// then applies surface-level effects (shadows, blur) to the result.
    ///
    /// This is the core Phase 3 optimization. Instead of applying expensive
    /// effects per-child (N × 220µs), we draw all children as simple geometry
    /// into a surface, then apply the effect once (1 × 220µs).
    fn draw_render_surface(&self, surface: &PainterRenderSurface) {
        let canvas = self.canvas;

        // Apply ancestor clip path so surface-level effects (blur, shadows)
        // cannot escape ancestor clipping boundaries.
        let has_clip = surface.clip_path.is_some();
        if let Some(ref clip) = surface.clip_path {
            canvas.save();
            canvas.clip_path(clip, None, true);
        }

        // Apply effect quality reduction for interactive frames.
        let reduced;
        let effects = if self.is_reduced_quality() {
            reduced = Self::reduce_effects(&surface.effects);
            &reduced
        } else {
            &surface.effects
        };

        // Build the draw-children closure.
        let draw_content = || {
            // Draw the container's own layer (background fills/strokes).
            if let Some(ref own_layer) = surface.own_layer {
                self.draw_layer(own_layer);
            }
            // Draw children into the same surface.
            self.draw_render_commands(&surface.children);
        };

        // Apply the surface-level effects. The effect ordering mirrors
        // draw_shape_with_effects but operates on the entire subtree:
        //
        //   1. Outer wrapper: blend mode isolation (if not PassThrough)
        //   2. Outer wrapper: layer blur (wraps everything)
        //   3. Drop shadows (drawn via save_layer with drop_shadow filter)
        //   4. Content (draw_content)
        //   5. Inner shadows (clipped to surface bounds)
        //   6. Opacity (applied when compositing into parent)

        // Compute surface bounds in Skia Rect (world space).
        let bounds = Rect::from_xywh(
            surface.bounds.x,
            surface.bounds.y,
            surface.bounds.width,
            surface.bounds.height,
        );

        // Blend mode isolation wraps everything.
        let apply_blendmode = |f: &dyn Fn()| match surface.blend_mode {
            LayerBlendMode::PassThrough => f(),
            LayerBlendMode::Blend(blend_mode) => {
                let mut paint = SkPaint::default();
                paint.set_blend_mode(blend_mode.into());
                let layer_rec = SaveLayerRec::default().bounds(&bounds).paint(&paint);
                canvas.save_layer(&layer_rec);
                f();
                canvas.restore();
            }
        };

        apply_blendmode(&|| {
            // Opacity isolation: wrap the entire surface in a save_layer_alpha
            // so the composited result is drawn with the surface opacity.
            let apply_opacity = |f: &dyn Fn()| {
                if surface.opacity < 1.0 {
                    canvas.save_layer_alpha(bounds, (surface.opacity * 255.0) as u32);
                    f();
                    canvas.restore();
                } else {
                    f();
                }
            };

            apply_opacity(&|| {
                // Layer blur wraps everything (shadows + content + inner shadows).
                let apply_blur = |f: &dyn Fn()| {
                    if let Some(ref layer_blur) = effects.blur {
                        self.with_layer_blur(&layer_blur.blur, bounds, f);
                    } else {
                        f();
                    }
                };

                apply_blur(&|| {
                    let has_drop_shadows = effects
                        .shadows
                        .iter()
                        .any(|s| matches!(s, FilterShadowEffect::DropShadow(_)));
                    let has_inner_shadows = effects
                        .shadows
                        .iter()
                        .any(|s| matches!(s, FilterShadowEffect::InnerShadow(_)));

                    if has_drop_shadows {
                        // For drop shadows on a render surface, we use Skia's
                        // drop_shadow image filter on a save_layer. This draws
                        // both the shadow AND the source in one pass.
                        //
                        // For multiple drop shadows, we chain them: each shadow
                        // wraps the previous via nested save_layers.
                        let drop_shadows: Vec<&FeShadow> = effects
                            .shadows
                            .iter()
                            .filter_map(|s| match s {
                                FilterShadowEffect::DropShadow(ds) => Some(ds),
                                _ => None,
                            })
                            .collect();

                        // Apply drop shadows from outermost to innermost.
                        // The outermost shadow wraps everything, including other
                        // shadows + content.
                        let mut save_count = 0;
                        for ds in &drop_shadows {
                            let filter = Self::drop_shadow_with_source_filter(ds);
                            if let Some(filter) = filter {
                                let mut paint = SkPaint::default();
                                paint.set_image_filter(filter);
                                let expansion =
                                    ds.blur * 3.0 + ds.spread.abs() + ds.dx.abs() + ds.dy.abs();
                                let expanded = bounds.with_outset((expansion, expansion));
                                canvas.save_layer(
                                    &SaveLayerRec::default().bounds(&expanded).paint(&paint),
                                );
                                save_count += 1;
                            }
                        }

                        // Draw content inside all shadow layers.
                        draw_content();

                        // Restore all shadow layers.
                        for _ in 0..save_count {
                            canvas.restore();
                        }
                    } else {
                        // No drop shadows — draw content directly.
                        draw_content();
                    }

                    // Inner shadows applied after content, clipped to surface bounds.
                    if has_inner_shadows {
                        for shadow_effect in &effects.shadows {
                            if let FilterShadowEffect::InnerShadow(is) = shadow_effect {
                                // For render surface inner shadows, clip to the surface
                                // bounds and draw an inner shadow rect.
                                let inner_filter = shadow::inner_shadow_image_filter(is);
                                let mut shadow_paint = SkPaint::default();
                                shadow_paint.set_image_filter(inner_filter);
                                shadow_paint.set_anti_alias(self.policy.anti_alias());
                                canvas.save();
                                canvas.clip_rect(bounds, None, true);
                                canvas.draw_rect(bounds, &shadow_paint);
                                canvas.restore();
                            }
                        }
                    }
                });
            });
        });

        // Restore the clip if we applied one.
        if has_clip {
            canvas.restore();
        }
    }

    /// Create a drop shadow image filter that includes both the shadow AND the
    /// source content (unlike `drop_shadow_only` which draws only the shadow).
    fn drop_shadow_with_source_filter(shadow: &FeShadow) -> Option<skia_safe::ImageFilter> {
        let color: skia_safe::Color = shadow.color.into();
        if shadow.spread != 0.0 {
            // With spread: dilate/erode -> blur -> offset, then merge with source
            let morph = if shadow.spread > 0.0 {
                skia_safe::image_filters::dilate((shadow.spread, shadow.spread), None, None)
            } else {
                skia_safe::image_filters::erode((-shadow.spread, -shadow.spread), None, None)
            };

            let blurred = if shadow.blur > 0.0 {
                skia_safe::image_filters::blur((shadow.blur, shadow.blur), None, morph, None)
            } else {
                morph
            };

            let offset = skia_safe::image_filters::offset((shadow.dx, shadow.dy), blurred, None);

            // Colorize: use color_filter to tint the shadow
            let color_matrix = skia_safe::color_filters::blend(color, skia_safe::BlendMode::SrcIn);
            let colorized = color_matrix
                .and_then(|cf| skia_safe::image_filters::color_filter(cf, offset, None));

            // Merge shadow + source (None = passthrough source)
            colorized.and_then(|shadow_layer| {
                skia_safe::image_filters::merge([Some(shadow_layer), None], None)
            })
        } else {
            // Fast path: use Skia's built-in drop_shadow (draws shadow + source)
            skia_safe::image_filters::drop_shadow(
                (shadow.dx, shadow.dy),
                (shadow.blur, shadow.blur),
                color,
                None,
                None,
                None,
            )
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
                PainterRenderCommand::RenderSurface(_) => {
                    // Render surfaces don't contribute mask paths
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
                let ek = if self.can_unify_variant && entry.layer.effects_empty() {
                    0
                } else {
                    self.variant_key
                };
                if let Some(pic) = scene_cache.get_node_picture_variant(&entry.id, ek) {
                    self.canvas.draw_picture(pic, None, None);
                    self.cache_hits.set(self.cache_hits.get() + 1);
                    continue;
                }
            }
            self.draw_layer_outline(&entry.layer, style);
        }
    }

    pub fn cache_picture_hits(&self) -> usize {
        self.cache_hits.get()
    }
}
