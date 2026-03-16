use crate::cg::prelude::*;
use crate::node::{scene_graph::SceneGraph, schema::*};
use crate::painter::Painter;
use crate::runtime::camera::CameraChangeKind;
use crate::runtime::counter::FrameCounter;
use crate::runtime::render_policy::RenderPolicy;
use crate::sk;
use crate::{
    cache,
    resources::{self, ByteStore, Resources},
    runtime::{
        camera::Camera2D,
        config::{PixelPreviewStrategy, RuntimeRendererConfig},
        font_repository::FontRepository,
        image_repository::ImageRepository,
        pixel_preview::{compute_pixel_preview_plan, PixelPreviewInputs},
        system_images,
    },
};

use math2::{self, rect};
use skia_safe::{
    surfaces, Canvas, FilterMode, Image, MipmapMode, Paint as SkPaint, Picture, PictureRecorder,
    Rect, SamplingOptions, Surface,
};
use std::collections::HashSet;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

fn normalize_image_id(id: &str) -> String {
    if id.starts_with("res://") || id.starts_with("system://") {
        id.to_string()
    } else {
        format!("res://images/{}", id)
    }
}

fn detect_image_mime(bytes: &[u8]) -> &'static str {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]) {
        "image/png"
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        "image/jpeg"
    } else if bytes.len() > 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        "image/webp"
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        "image/gif"
    } else {
        "application/octet-stream"
    }
}

/// Callback type used to request a redraw from the host window.
pub type RequestRedrawCallback = Arc<dyn Fn()>;

/// Options controlling renderer behaviour.
#[derive(Clone, Copy)]
pub struct RendererOptions {
    /// When true, embedded fonts will be registered.
    pub use_embedded_fonts: bool,
}

impl Default for RendererOptions {
    fn default() -> Self {
        Self {
            use_embedded_fonts: false,
        }
    }
}

fn collect_scene_font_families(scene: &Scene) -> HashSet<String> {
    fn walk(id: &NodeId, graph: &SceneGraph, set: &mut HashSet<String>) {
        if let Ok(node) = graph.get_node(id) {
            match node {
                Node::TextSpan(n) => {
                    set.insert(n.text_style.font_family.clone());
                }
                _ => {}
            }
        }
        if let Some(children) = graph.get_children(id) {
            for child in children {
                walk(child, graph, set);
            }
        }
    }

    let mut set = HashSet::new();
    for id in scene.graph.roots() {
        walk(&id, &scene.graph, &mut set);
    }
    set
}

#[derive(Clone)]
pub struct FramePlan {
    pub stable: bool,
    /// What kind of camera change triggered this frame.
    /// Used by downstream stages to take optimized paths (e.g. skip tile
    /// invalidation when only panning, skip LOD recomputation, etc.).
    pub camera_change: CameraChangeKind,
    /// Node IDs that will be drawn via cached layer images (compositor blit).
    pub promoted: Vec<NodeId>,
    /// regions with their intersecting indices (live-drawn nodes only)
    pub regions: Vec<(rect::Rectangle, Vec<usize>)>,
    pub display_list_duration: Duration,
    pub display_list_size_estimated: usize,
}

#[derive(Clone)]
pub struct DrawResult {
    pub painter_duration: Duration,
    pub cache_picture_used: usize,
    pub cache_picture_size: usize,
    pub cache_geometry_size: usize,
    /// Total number of promoted nodes in the layer compositing cache.
    pub layer_image_cache_size: usize,
    /// Number of nodes drawn via cached layer image (cache hits).
    pub layer_image_cache_hits: usize,
    /// Estimated memory usage of the layer compositing cache in bytes.
    pub layer_image_cache_bytes: usize,
    /// Number of nodes drawn live (not from cache).
    pub live_draw_count: usize,
}

pub enum FrameFlushResult {
    OK(FrameFlushStats),
    NoPending,
    NoFrame,
    NoScene,
}

#[derive(Clone)]
pub struct FrameFlushStats {
    pub frame: FramePlan,
    pub draw: DrawResult,
    pub frame_duration: Duration,
    pub flush_duration: Duration,
    pub total_duration: Duration,
    /// Time spent in update_compositor (CPU-side capture/skip logic).
    pub compositor_duration: Duration,
    /// GPU flush after draw, before compositor (isolates draw GPU cost).
    pub mid_flush_duration: Duration,
}

/// Choice of GPU vs. raster backend
pub enum Backend {
    GL(*mut Surface),
    Raster(*mut Surface),
}

impl Backend {
    pub fn get_surface(&self) -> *mut Surface {
        match self {
            Backend::GL(ptr) | Backend::Raster(ptr) => *ptr,
        }
    }

    /// Returns true when the backend is GPU-accelerated (GL).
    pub fn is_gpu(&self) -> bool {
        matches!(self, Backend::GL(_))
    }

    pub fn new_from_raster(width: i32, height: i32) -> Self {
        let surface = Self::init_raster_surface(width, height);
        Self::Raster(surface)
    }

    pub fn init_raster_surface(width: i32, height: i32) -> *mut Surface {
        let surface =
            surfaces::raster_n32_premul((width, height)).expect("Failed to create raster surface");
        Box::into_raw(Box::new(surface))
    }
}

/// Window/viewport context for the renderer
///
/// This serves as the source of truth for window state and enables
/// dependency-based layout where nodes can depend on viewport dimensions
/// (e.g., ICB sizing, future vw/vh units)
#[derive(Debug, Clone)]
pub struct RendererWindowContext {
    /// Current viewport/window size
    pub viewport_size: Size,
}

impl RendererWindowContext {
    pub fn new(viewport_size: Size) -> Self {
        Self { viewport_size }
    }
}

/// ---------------------------------------------------------------------------
/// Renderer: manages backend, DPI, camera, and iterates over scene children
/// ---------------------------------------------------------------------------
/// Maximum dimension for the shared compositor offscreen surface.
/// Nodes larger than this in either axis are skipped for compositing.
const COMPOSITOR_SURFACE_SIZE: i32 = 4096;

pub struct Renderer {
    pub backend: Backend,
    pub scene: Option<Scene>,
    scene_cache: cache::scene::SceneCache,
    pub camera: Camera2D,
    pub resources: Resources,
    pub images: ImageRepository,
    pub fonts: FontRepository,
    /// when called, the host will request a redraw in os-specific way
    request_redraw: Option<RequestRedrawCallback>,
    /// frame counter for managing render queue
    fc: FrameCounter,
    /// the frame plan for the next frame, to be drawn and flushed
    plan: Option<FramePlan>,
    /// Runtime configuration for renderer behaviour
    config: RuntimeRendererConfig,
    /// Layout computation engine (owns cache, detects changes)
    layout_engine: crate::layout::engine::LayoutEngine,
    /// Window/viewport context - source of truth for viewport state
    pub window_context: RendererWindowContext,
    /// Shared GPU surface reused for all compositor node captures.
    /// Lazily created from the parent surface on first use.
    /// One allocation, reused across all nodes and all frames.
    compositor_surface: Option<Surface>,
    /// Texture atlas for batch-friendly compositor blitting.
    /// Packs per-node cached images into shared large textures so that
    /// compositing uses same-texture sub-rect draws instead of switching
    /// between thousands of individual GPU textures.
    compositor_atlas: cache::atlas::atlas_set::AtlasSet,
    /// Cached downscale surface for interaction rendering.
    /// Reused across frames to avoid GPU texture allocation per frame.
    downscale_surface: Option<Surface>,
    /// Dimensions of the cached downscale surface (to detect size changes).
    downscale_dims: (i32, i32),
}

impl Renderer {
    #[inline]
    fn clear_and_paint_background(
        canvas: &Canvas,
        background_color: Option<CGColor>,
        width: f32,
        height: f32,
    ) {
        canvas.clear(skia_safe::Color::TRANSPARENT);

        if let Some(bg_color) = background_color {
            let color: skia_safe::Color = bg_color.into();
            let mut paint = SkPaint::default();
            paint.set_color(color);
            canvas.draw_rect(Rect::new(0.0, 0.0, width, height), &paint);
        }
    }

    #[inline]
    fn prefill_picture_cache_for_plan(
        &mut self,
        plan: &FramePlan,
        policy: RenderPolicy,
    ) {
        let variant_key = policy.variant_key();
        // Prefill picture cache for visible layers so Painter can reuse pictures even with masks
        for (_region, indices) in &plan.regions {
            for idx in indices {
                if let Some(entry) = self.scene_cache.layers.layers.get(*idx).cloned() {
                    let id = entry.id;
                    let _ = self.with_recording_cached_with_policy(
                        &id,
                        variant_key,
                        policy,
                        |painter| {
                            painter.draw_layer(&entry.layer);
                        },
                    );
                }
            }
        }
    }

    #[inline]
    fn draw_layers_with_scene_cache(&mut self, canvas: &Canvas, plan: &FramePlan) -> usize {
        self.draw_layers_with_scene_cache_skip(canvas, plan, None)
    }

    fn draw_layers_with_scene_cache_skip(
        &mut self,
        canvas: &Canvas,
        plan: &FramePlan,
        promoted_skip: Option<&std::collections::HashSet<NodeId>>,
    ) -> usize {
        // Select effect quality based on frame stability.
        // Unstable (interactive) frames use reduced effects for performance.
        // Stable (settled) frames use full quality.
        let policy = if plan.stable {
            self.config.render_policy
        } else {
            self.config.render_policy.with_reduced_effects()
        };

        self.prefill_picture_cache_for_plan(plan, policy);

        let painter = Painter::new_with_scene_cache(
            canvas,
            &self.fonts,
            &self.images,
            &self.scene_cache,
            policy,
        );
        let painter = if let Some(skip) = promoted_skip {
            painter.with_promoted_skip(skip)
        } else {
            painter
        };
        painter.draw_layer_list(&self.scene_cache.layers);
        painter.cache_picture_hits()
    }

    pub fn new(
        backend: Backend,
        request_redraw: Option<RequestRedrawCallback>,
        camera: Camera2D,
    ) -> Self {
        Self::new_with_options(backend, request_redraw, camera, RendererOptions::default())
    }

    pub fn new_with_options(
        backend: Backend,
        request_redraw: Option<RequestRedrawCallback>,
        camera: Camera2D,
        options: RendererOptions,
    ) -> Self {
        Self::new_with_store(
            backend,
            request_redraw,
            camera,
            Arc::new(Mutex::new(ByteStore::new())),
            options,
        )
    }

    pub fn new_with_store(
        backend: Backend,
        request_redraw: Option<RequestRedrawCallback>,
        camera: Camera2D,
        store: Arc<Mutex<ByteStore>>,
        options: RendererOptions,
    ) -> Self {
        let mut resources = Resources::with_store(store.clone());
        let mut font_repository = FontRepository::new(store.clone());
        if options.use_embedded_fonts {
            font_repository.register_embedded_fonts();
        }
        let mut image_repository = ImageRepository::new(store);
        system_images::register(&mut resources, &mut image_repository);
        let viewport_size = *camera.get_size();
        Self {
            backend,
            scene: None,
            camera,
            resources,
            images: image_repository,
            fonts: font_repository,
            scene_cache: cache::scene::SceneCache::new(),
            request_redraw,
            fc: FrameCounter::new(),
            plan: None,
            config: RuntimeRendererConfig::default(),
            layout_engine: crate::layout::engine::LayoutEngine::new(),
            window_context: RendererWindowContext::new(viewport_size),
            compositor_surface: None,
            compositor_atlas: cache::atlas::atlas_set::AtlasSet::new(
                cache::atlas::atlas_set::AtlasSetConfig::default(),
            ),
            downscale_surface: None,
            downscale_dims: (0, 0),
        }
    }

    /// Update the redraw callback used to notify the host when a new frame is
    /// ready.
    pub fn set_request_redraw(&mut self, cb: RequestRedrawCallback) {
        self.request_redraw = Some(cb);
    }

    /// Access the cached scene data.
    pub fn get_cache(&self) -> &cache::scene::SceneCache {
        &self.scene_cache
    }

    /// Update the text content for a node in the layer list and render
    /// command tree.
    ///
    /// Used during text editing to keep the rendered text in sync with the
    /// editing session without rebuilding the full layer list. Also
    /// invalidates the paragraph cache and picture cache for this node so
    /// the next draw uses the fresh text.
    ///
    /// **Fragility note**: This walks both the flat layer list and the
    /// render command tree to patch text in-place. If new
    /// `PainterRenderCommand` variants are added, the inner
    /// `update_commands` function must be updated to traverse them.
    pub fn update_layer_text(&mut self, node_id: NodeId, text: &str) {
        use crate::painter::layer::{PainterPictureLayer, PainterRenderCommand};

        // Update text in the flat layer entries.
        for entry in &mut self.scene_cache.layers.layers {
            if let PainterPictureLayer::Text(ref mut tl) = entry.layer {
                if tl.base.id == node_id {
                    tl.text = text.to_owned();
                    break;
                }
            }
        }

        // Update text in the render command tree (this is what the Painter
        // actually draws via draw_render_commands).
        fn update_commands(commands: &mut [PainterRenderCommand], node_id: NodeId, text: &str) {
            for cmd in commands.iter_mut() {
                match cmd {
                    PainterRenderCommand::Draw(ref mut layer) => {
                        if let PainterPictureLayer::Text(ref mut tl) = layer {
                            if tl.base.id == node_id {
                                tl.text = text.to_owned();
                            }
                        }
                    }
                    PainterRenderCommand::MaskGroup(ref mut group) => {
                        update_commands(&mut group.mask_commands, node_id, text);
                        update_commands(&mut group.content_commands, node_id, text);
                    }
                    PainterRenderCommand::RenderSurface(ref mut surface) => {
                        if let Some(ref mut own_layer) = surface.own_layer {
                            if let PainterPictureLayer::Text(ref mut tl) = own_layer {
                                if tl.base.id == node_id {
                                    tl.text = text.to_owned();
                                }
                            }
                        }
                        update_commands(&mut surface.children, node_id, text);
                    }
                }
            }
        }
        update_commands(&mut self.scene_cache.layers.commands, node_id, text);

        // Invalidate the paragraph cache for this node so the Painter
        // rebuilds the paragraph with the new text.
        self.scene_cache
            .paragraph
            .borrow_mut()
            .invalidate_by_id(node_id);

        // Invalidate the picture cache for this node so the Painter
        // doesn't use a stale cached picture.
        self.scene_cache.picture.invalidate_node(node_id);

        // Invalidate the compositor layer image for this node.
        self.scene_cache.compositor.invalidate(&node_id);
        // Free the atlas slot — it will be re-allocated on next capture.
        self.compositor_atlas.free_node(&node_id);
    }

    pub fn canvas(&self) -> &Canvas {
        let surface = unsafe { &mut *self.backend.get_surface() };
        surface.canvas()
    }

    /// Register a font for the given family.
    ///
    /// Multiple calls with the same `family` and different font files are
    /// supported. Each call adds a typeface to that family (e.g. Regular,
    /// Bold, Italic, or variable font axes). Use the family name that
    /// appears in the scene (e.g. `style.font_family` from Figma).
    pub fn add_font(&mut self, family: &str, bytes: &[u8]) {
        let hash = resources::hash_bytes(bytes);
        let rid = format!("res://fonts/{}", family);
        self.resources.insert(&rid, bytes.to_vec());
        self.fonts.add(hash, family);
    }

    pub fn add_image(&mut self, bytes: &[u8]) -> (String, String, u32, u32, String) {
        let hash = resources::hash_bytes(bytes);
        let hash_str = format!("{:016x}", hash);
        let rid = format!("res://images/{}", hash_str);
        self.resources.insert(&rid, bytes.to_vec());

        let (width, height) = self.images.insert(rid.clone(), hash).unwrap_or((0, 0));

        let r#type = detect_image_mime(bytes).to_string();

        (hash_str, rid, width, height, r#type)
    }

    /// Register image bytes under a caller-specified RID (res:// or system://).
    /// Implements the res:// logical-identifier path per feat-resources Level 1.
    /// Returns metadata or None if rid is invalid (must start with res:// or system://).
    pub fn add_image_with_rid(&mut self, bytes: &[u8], rid: &str) -> Option<(u32, u32, String)> {
        let rid = rid.trim();
        if !rid.starts_with("res://") && !rid.starts_with("system://") {
            return None;
        }
        let hash = resources::hash_bytes(bytes);
        self.resources.insert(rid, bytes.to_vec());
        let (width, height) = self.images.insert(rid.to_string(), hash)?;
        let r#type = detect_image_mime(bytes).to_string();
        Some((width, height, r#type))
    }

    pub fn get_image_bytes(&self, id: &str) -> Option<Vec<u8>> {
        let rid = normalize_image_id(id);
        self.resources.get(&rid)
    }

    pub fn get_image_size(&self, id: &str) -> Option<(u32, u32)> {
        let rid = normalize_image_id(id);
        self.images.get_size(&rid)
    }

    /// Enable or disable the per-node layer compositing cache.
    ///
    /// Layer compositing requires a GPU backend — offscreen surfaces share
    /// the GL context so cached images stay in VRAM.  On a raster backend
    /// the setting is accepted but silently ignored at render time.
    pub fn set_layer_compositing(&mut self, enable: bool) {
        self.config.layer_compositing = enable;
        if !enable {
            self.scene_cache.compositor.clear();
            self.compositor_atlas.clear();
        }
    }

    /// Set the render scale for interaction (unstable) frames.
    ///
    /// During active pan/zoom, the scene is rendered at this fraction of
    /// the display resolution, then upscaled with bilinear filtering.
    ///
    /// - `1.0` or `0.0`: disabled (full resolution)
    /// - `0.5`: quarter pixels (recommended default)
    /// - `0.25`: 1/16th pixels (aggressive, very blurry during interaction)
    ///
    /// Stable frames always render at full resolution regardless of this setting.
    pub fn set_interaction_render_scale(&mut self, scale: f32) {
        self.config.interaction_render_scale = scale.clamp(0.0, 1.0);
    }

    /// Enable or disable the compositor texture atlas.
    ///
    /// When enabled, per-node cached images are packed into shared atlas
    /// textures for batch-friendly GPU compositing (fewer texture switches).
    /// When disabled, each cached node uses an individual GPU texture.
    ///
    /// Only effective when layer compositing is also enabled.
    pub fn set_compositor_atlas(&mut self, enable: bool) {
        self.config.compositor_atlas = enable;
        if !enable {
            // Move atlas-backed entries back to dirty so they get
            // re-captured as individual textures on the next frame.
            self.scene_cache.compositor.invalidate_all();
            self.compositor_atlas.clear();
        }
    }

    /// Adjust the camera to fit the entire scene content in view with padding.
    pub fn fit_camera_to_scene(&mut self) {
        let Some(scene) = self.scene.as_ref() else {
            return;
        };

        let geometry = self.scene_cache.geometry();
        let mut union: Option<rect::Rectangle> = None;
        for root in scene.graph.roots() {
            if let Some(bounds) = geometry.get_world_bounds(&root) {
                union = Some(match union {
                    Some(existing) => rect::union(&[existing, bounds]),
                    None => bounds,
                });
            }
        }

        let Some(bounds) = union else {
            return;
        };

        let padding = 64.0;
        let padded = rect::Rectangle {
            x: bounds.x - padding,
            y: bounds.y - padding,
            width: (bounds.width + padding * 2.0).max(1.0),
            height: (bounds.height + padding * 2.0).max(1.0),
        };

        let viewport = self.camera.get_size();
        let zoom_x = viewport.width / padded.width.max(1.0);
        let zoom_y = viewport.height / padded.height.max(1.0);
        let target_zoom = zoom_x.min(zoom_y) * 0.98;
        if target_zoom.is_finite() && target_zoom > 0.0 {
            self.camera.set_zoom(target_zoom);
        }

        let center_x = padded.x + padded.width * 0.5;
        let center_y = padded.y + padded.height * 0.5;
        self.camera.set_center(center_x, center_y);
    }

    /// Configure pixel preview scale.
    ///
    /// - 0: Disabled
    /// - 1: 1x
    /// - 2: 2x
    pub fn set_pixel_preview_scale(&mut self, scale: u8) {
        self.config.pixel_preview_scale = match scale {
            1 | 2 => scale,
            _ => 0,
        };
    }

    pub fn set_pixel_preview_strategy(&mut self, strategy: PixelPreviewStrategy) {
        self.config.pixel_preview_strategy = strategy;
    }

    pub fn set_pixel_preview_strategy_stable(&mut self, stable: bool) {
        self.set_pixel_preview_strategy(if stable {
            PixelPreviewStrategy::Stable
        } else {
            PixelPreviewStrategy::Accurate
        });
    }

    /// Enable or disable outline mode (wireframe).
    pub fn set_outline_mode(&mut self, enable: bool) {
        self.config.render_policy = if enable {
            RenderPolicy::WIREFRAME_DEFAULT
        } else {
            RenderPolicy::STANDARD
        };
    }

    /// Configure the renderer render policy (standard vs wireframe presets, etc).
    pub fn set_render_policy(&mut self, policy: RenderPolicy) {
        self.config.render_policy = policy;
    }

    /// Render the queued frame if any and return the completed statistics.
    /// Intended to be called by the host when a redraw request is received.
    pub fn flush(&mut self) -> FrameFlushResult {
        if !self.fc.has_pending() {
            return FrameFlushResult::NoPending;
        }

        let Some(frame) = self.plan.take() else {
            return FrameFlushResult::NoFrame;
        };

        let start = Instant::now();

        let Some(scene_ptr) = self.scene.as_ref().map(|s| s as *const Scene) else {
            return FrameFlushResult::NoScene;
        };

        let surface = unsafe { &mut *self.backend.get_surface() };
        let scene = unsafe { &*scene_ptr };

        let width = surface.width() as f32;
        let height = surface.height() as f32;

        // Reuse or create a downscaled offscreen for interaction rendering.
        let interaction_scale = self.config.interaction_render_scale;
        let use_downscale = !frame.stable
            && interaction_scale > 0.0
            && interaction_scale < 1.0;
        if use_downscale {
            let sw = (width * interaction_scale).ceil() as i32;
            let sh = (height * interaction_scale).ceil() as i32;
            if sw > 0 && sh > 0 && (sw, sh) != self.downscale_dims {
                // Size changed — recreate the surface.
                let info = skia_safe::ImageInfo::new_n32_premul((sw, sh), None);
                self.downscale_surface = surface.new_surface(&info);
                self.downscale_dims = (sw, sh);
            }
        }

        // Take ownership of the downscale surface temporarily to avoid
        // double-mutable-borrow with self.draw().
        let mut ds_taken = if use_downscale {
            self.downscale_surface.take()
        } else {
            None
        };

        let mut canvas = surface.canvas();
        let draw = self.draw(
            &mut canvas,
            &frame,
            scene.background_color,
            width,
            height,
            ds_taken.as_mut(),
        );

        // Put it back for reuse next frame.
        if ds_taken.is_some() {
            self.downscale_surface = ds_taken;
        }

        // Layer compositing cache: capture (or re-capture) node images.
        //
        // GPU-only: offscreen surfaces share the GL context so cached
        // SkImages live in VRAM. On a CPU/raster backend the extra copy
        // would be strictly slower than direct painting, so we skip it.
        //
        // Runs on every frame — the method itself is cheap when all entries
        // are already cached and clean.  Rasterisation only happens for nodes
        // that are new or dirty (zoom change, content edit, etc.).
        // Mid-frame flush: isolate draw vs compositor GPU work.
        let mid_flush_start = Instant::now();
        if let Some(mut gr_context) = surface.recording_context() {
            if let Some(mut direct_context) = gr_context.as_direct_context() {
                direct_context.flush_and_submit();
            }
        }
        let mid_flush_duration = mid_flush_start.elapsed();

        let compositor_start = Instant::now();
        if self.backend.is_gpu() {
            let effective_layer_compositing = self.config.layer_compositing
                && self.config.render_policy.allows_layer_compositing();
            if effective_layer_compositing {
                if frame.stable {
                    // Stable frame: re-rasterize all stale entries at the
                    // final zoom density without a time budget.
                    self.update_compositor_stable(surface);
                } else {
                    // Unstable frame: budgeted re-rasterization. Stale
                    // entries stay GPU-stretched until their turn comes.
                    self.update_compositor(surface);
                }
            }
        }
        let compositor_duration = compositor_start.elapsed();

        let frame_duration = start.elapsed();

        let flush_start = Instant::now();
        if let Some(mut gr_context) = surface.recording_context() {
            if let Some(mut direct_context) = gr_context.as_direct_context() {
                direct_context.flush_and_submit();
            }
        }
        let flush_duration = flush_start.elapsed();

        let stats = FrameFlushStats {
            frame,
            draw,
            frame_duration,
            flush_duration,
            total_duration: frame_duration + flush_duration,
            compositor_duration,
            mid_flush_duration,
        };

        self.fc.flush();
        self.plan = None;

        FrameFlushResult::OK(stats)
    }

    /// Invoke the request redraw callback.
    fn request_redraw(&self) {
        if let Some(cb) = &self.request_redraw {
            cb();
        }
    }

    pub fn free(&mut self) {
        let backend = std::mem::replace(&mut self.backend, Backend::Raster(std::ptr::null_mut()));
        let surface = unsafe { Box::from_raw(backend.get_surface()) };
        if let Some(mut gr_context) = surface.recording_context() {
            if let Some(mut direct_context) = gr_context.as_direct_context() {
                direct_context.abandon();
            }
        }
    }

    /// Load a scene into the renderer. Caching will be performed lazily during
    /// rendering based on the configured caching strategy.
    pub fn load_scene(&mut self, scene: Scene) {
        self.scene = Some(scene);

        self.scene_cache = cache::scene::SceneCache::new();
        if let Some(scene) = self.scene.as_ref() {
            let requested = collect_scene_font_families(scene);
            self.fonts.set_requested_families(requested.into_iter());

            let viewport_size = self.window_context.viewport_size;

            // 1. Compute layout phase
            {
                let mut paragraph_cache = self.scene_cache.paragraph.borrow_mut();
                self.layout_engine.compute(
                    scene,
                    viewport_size,
                    Some(crate::layout::tree::TextMeasureProvider {
                        paragraph_cache: &mut paragraph_cache,
                        fonts: &self.fonts,
                    }),
                );
            }

            // 2. Build geometry with layout results
            let layout_result = self.layout_engine.result();
            self.scene_cache.update_geometry_with_layout(
                scene,
                &self.fonts,
                layout_result,
                viewport_size,
            );

            // 3. Build effect tree (identifies render surface boundaries)
            self.scene_cache.update_effect_tree(scene);

            // 4. Build layers
            self.scene_cache.update_layers(scene);
        }
        self.queue_stable();
    }

    fn queue(&mut self, stable: bool) {
        // Classify camera change *before* building the frame plan so that
        // downstream stages (tile cache, LOD selection, etc.) can branch on it.
        let camera_change = self.camera.change_kind();

        // On zoom change, mark compositor cache entries as stale (not dirty).
        // Stale entries remain valid for GPU-stretched blitting — the draw
        // path applies a compensating scale transform. They are progressively
        // re-rasterized within the per-frame time budget by update_compositor().
        //
        // Previous behavior: invalidate_all() + atlas.clear() caused full
        // re-rasterization of all promoted nodes in a single frame, producing
        // 94-146ms frames (6-10 fps) on effects-heavy scenes.
        if camera_change.zoom_changed() && self.config.layer_compositing {
            self.scene_cache.compositor.mark_all_stale();
        }

        // Always compute the latest frame plan so that a subsequent flush uses up-to-date state,
        // even if a previous frame is already pending.
        let rect = Some(self.camera.rect());
        self.plan = Some(self.frame(
            rect.unwrap_or(rect::Rectangle::empty()),
            self.camera.get_zoom(),
            stable,
            camera_change,
        ));

        // Only request a redraw if there isn't already one pending.
        if !self.fc.has_pending() {
            self.fc.queue();
            self.request_redraw();
        }
    }

    /// queue a frame with unstable (fast) frame plan
    pub fn queue_unstable(&mut self) {
        self.queue(false);
    }

    /// queue a frame with stable (slow) frame plan
    pub fn queue_stable(&mut self) {
        self.queue(true);
    }

    /// Clear the cached scene picture.
    pub fn invalidate_cache(&mut self) {
        self.scene_cache.invalidate();
        // Also invalidate all compositor layer images so they re-rasterize.
        self.scene_cache.compositor.invalidate_all();
        self.compositor_atlas.clear();
    }

    /// Rebuild scene caches after scene geometry has changed.
    /// Call this after modifying node sizes, positions, or other geometry properties.
    pub fn rebuild_scene_caches(&mut self) {
        if let Some(scene) = self.scene.as_ref() {
            let viewport_size = self.window_context.viewport_size;

            // 1. Recompute layout
            {
                let mut paragraph_cache = self.scene_cache.paragraph.borrow_mut();
                self.layout_engine.compute(
                    scene,
                    viewport_size,
                    Some(crate::layout::tree::TextMeasureProvider {
                        paragraph_cache: &mut paragraph_cache,
                        fonts: &self.fonts,
                    }),
                );
            }

            // 2. Rebuild geometry with layout results
            let layout_result = self.layout_engine.result();
            self.scene_cache.update_geometry_with_layout(
                scene,
                &self.fonts,
                layout_result,
                viewport_size,
            );

            // 3. Rebuild effect tree
            self.scene_cache.update_effect_tree(scene);

            // 4. Rebuild layers
            self.scene_cache.update_layers(scene);
        }
    }

    /// Update viewport context with new size
    ///
    /// This updates the source of truth for viewport/window dimensions.
    /// Should be called before resolving viewport dependencies.
    pub fn update_viewport_size(&mut self, width: f32, height: f32) {
        self.window_context.viewport_size = Size { width, height };
    }

    #[allow(dead_code)]
    fn with_recording(
        &self,
        bounds: &rect::Rectangle,
        draw: impl FnOnce(&Painter),
    ) -> Option<Picture> {
        self.with_recording_with_policy(bounds, self.config.render_policy, draw)
    }

    fn with_recording_with_policy(
        &self,
        bounds: &rect::Rectangle,
        policy: RenderPolicy,
        draw: impl FnOnce(&Painter),
    ) -> Option<Picture> {
        let mut recorder = PictureRecorder::new();
        let sk_bounds = Rect::new(
            bounds.x,
            bounds.y,
            bounds.x + bounds.width,
            bounds.y + bounds.height,
        );
        let canvas = recorder.begin_recording(sk_bounds, true);
        let painter = Painter::new_with_scene_cache(
            canvas,
            &self.fonts,
            &self.images,
            &self.scene_cache,
            policy,
        );
        draw(&painter);
        recorder.finish_recording_as_picture(None)
    }

    #[cfg(test)]
    fn with_recording_cached(
        &mut self,
        id: &NodeId,
        variant_key: u64,
        draw: impl FnOnce(&Painter),
    ) -> Option<Picture> {
        self.with_recording_cached_with_policy(
            id,
            variant_key,
            self.config.render_policy,
            draw,
        )
    }

    fn with_recording_cached_with_policy(
        &mut self,
        id: &NodeId,
        variant_key: u64,
        policy: RenderPolicy,
        draw: impl FnOnce(&Painter),
    ) -> Option<Picture> {
        if let Some(pic) = self
            .scene_cache
            .picture
            .get_node_picture_variant(id, variant_key)
        {
            return Some(pic.clone());
        }

        let Some(bounds) = self.scene_cache.geometry.get_render_bounds(&id) else {
            return None;
        };
        let pic = self.with_recording_with_policy(&bounds, policy, draw);

        if let Some(pic) = &pic {
            self.scene_cache
                .picture
                .set_node_picture_variant(id.clone(), variant_key, pic.clone());
        }
        pic
    }

    /// Plan the frame for rendering.
    ///
    /// # Arguments
    /// - `bounds`: the bounding rect to be rendered (in world space)
    /// - `zoom`: the current zoom level
    /// - `stable`: whether this is a stable (high quality) or unstable (fast) frame
    /// - `camera_change`: classification of what changed in the camera transform
    fn frame(
        &self,
        bounds: rect::Rectangle,
        _zoom: f32,
        stable: bool,
        camera_change: CameraChangeKind,
    ) -> FramePlan {
        let __start = Instant::now();

        let painter_region = vec![bounds];

        let effective_layer_compositing = self.config.layer_compositing
            && self.config.render_policy.allows_layer_compositing();

        let mut promoted_ids: Vec<NodeId> = Vec::new();
        let mut regions: Vec<(rect::Rectangle, Vec<usize>)> = Vec::new();

        for rect in painter_region {
            let mut indices = self.scene_cache.intersects(rect);

            // TODO: sort is expensive — consider incremental visible-set
            // update (item 19) for pan-only frames where the entering/exiting
            // sets are tiny.
            indices.sort();

            if effective_layer_compositing {
                // Separate promoted (cached) nodes from live-drawn nodes.
                let mut live_indices = Vec::new();
                for &idx in &indices {
                    if let Some(entry) = self.scene_cache.layers.layers.get(idx) {
                        if self.scene_cache.compositor.peek(&entry.id).is_some() {
                            promoted_ids.push(entry.id);
                        } else {
                            live_indices.push(idx);
                        }
                    }
                }
                if !live_indices.is_empty() {
                    regions.push((rect, live_indices));
                }
            } else {
                regions.push((rect, indices));
            }
        }

        let ll_len = regions.iter().map(|(_, indices)| indices.len()).sum();

        let __ll_duration = __start.elapsed();

        FramePlan {
            stable,
            camera_change,
            promoted: promoted_ids,
            regions,
            display_list_duration: __ll_duration,
            display_list_size_estimated: ll_len,
        }
    }

    /// Draw the scene to the canvas.
    /// - canvas: the canvas to render to
    /// - plan: the frame plan
    /// - width: the width of the canvas
    /// - height: the height of the canvas
    /// - downscale_surface: pre-created offscreen for interaction downscaling (None = full res)
    fn draw(
        &mut self,
        canvas: &Canvas,
        plan: &FramePlan,
        background_color: Option<CGColor>,
        width: f32,
        height: f32,
        downscale_surface: Option<&mut Surface>,
    ) -> DrawResult {
        let __before_paint = Instant::now();

        let zoom = self.camera.get_zoom();
        let pixel_preview_scale = self.config.pixel_preview_scale;
        let pixel_preview_strategy = self.config.pixel_preview_strategy;

        // Pixel Preview: render the scene at a reduced internal resolution, then
        // scale up with nearest-neighbor sampling.
        //
        // Only activate when zooming in beyond the selected preview scale.
        // (At zoom <= scale, this would not be a downsample and is effectively a no-op.)
        let cam_t = self.camera.get_transform();
        let pixel_preview = compute_pixel_preview_plan(PixelPreviewInputs {
            viewport: Size { width, height },
            zoom,
            pixel_preview_scale,
            strategy: pixel_preview_strategy,
            camera_center: (cam_t.x(), cam_t.y()),
            camera_rotation: cam_t.rotation(),
        });

        if pixel_preview.enabled {
            let (surf_w, surf_h) = pixel_preview.surface_px;
            if let Some(mut offscreen) = surfaces::raster_n32_premul((surf_w, surf_h)) {
                let off_canvas = offscreen.canvas();
                Self::clear_and_paint_background(
                    off_canvas,
                    background_color,
                    surf_w as f32,
                    surf_h as f32,
                );

                off_canvas.save();
                if pixel_preview.overscan_pad_px != 0 {
                    let (tx, ty) = pixel_preview.offscreen_canvas_translate;
                    off_canvas.translate((tx, ty));
                }
                off_canvas.concat(&sk::sk_matrix(pixel_preview.view_matrix.matrix));
                let cache_picture_used = self.draw_layers_with_scene_cache(off_canvas, plan);

                off_canvas.restore();

                // Present: upscale to the main canvas using nearest-neighbor sampling.
                Self::clear_and_paint_background(canvas, background_color, width, height);

                let image = offscreen.image_snapshot();
                let sampling = SamplingOptions::new(FilterMode::Nearest, MipmapMode::None);
                let mut paint = SkPaint::default();
                paint.set_anti_alias(false);
                let pr = pixel_preview.src_rect;
                let src = Rect::from_xywh(pr.x, pr.y, pr.w, pr.h);
                canvas.draw_image_rect_with_sampling_options(
                    &image,
                    Some((&src, skia_safe::canvas::SrcRectConstraint::Fast)),
                    Rect::new(0.0, 0.0, width, height),
                    sampling,
                    &paint,
                );

                let __painter_duration = __before_paint.elapsed();

                return DrawResult {
                    painter_duration: __painter_duration,
                    cache_picture_used,
                    cache_picture_size: self.scene_cache.picture.len(),
                    cache_geometry_size: self.scene_cache.geometry.len(),
                    layer_image_cache_size: 0,
                    layer_image_cache_hits: 0,
                    layer_image_cache_bytes: 0,
                    live_draw_count: 0,
                };
            }
        }

        // --- Interaction render scale: downscale unstable frames ---
        // During active interaction, render at reduced resolution into a
        // pre-created offscreen surface, then upscale to the display canvas
        // with bilinear filtering. This reduces ALL GPU work proportionally.
        if let Some(offscreen) = downscale_surface {
            let scale = self.config.interaction_render_scale;
            let scaled_w = offscreen.width();
            let scaled_h = offscreen.height();
            let result = self.draw_to_offscreen_and_upscale(
                canvas, offscreen, plan, background_color,
                width, height,
                scaled_w, scaled_h,
                scale,
            );
            if let Some(r) = result {
                return r;
            }
            // Fallback: draw at full resolution below.
        }

        canvas.clear(skia_safe::Color::TRANSPARENT);

        Self::clear_and_paint_background(canvas, background_color, width, height);

        canvas.save();

        // Apply camera transform
        canvas.concat(&sk::sk_matrix(self.camera.view_matrix().matrix));

        // Draw promoted nodes from the layer compositing cache.
        // Each cached image is blitted at its world-space render bounds.
        // The camera view matrix (already applied to canvas) handles zoom.
        // Opacity and blend mode are stored in LayerImage at capture time.
        //
        // Atlas-backed nodes use same-texture sub-rect draws (batch-friendly,
        // eliminates GPU texture switching). Individual-backed nodes use
        // per-node texture blits as fallback.
        let mut layer_image_cache_hits = 0usize;
        let promoted_set: std::collections::HashSet<NodeId> =
            plan.promoted.iter().copied().collect();
        if !plan.promoted.is_empty() {
            for id in &plan.promoted {
                if let Some(layer_img) = self.scene_cache.compositor.get(id) {
                    let b = &layer_img.local_bounds;
                    let dst = Rect::from_xywh(b.x, b.y, b.width, b.height);
                    let mut paint = SkPaint::default();
                    if layer_img.opacity < 1.0 {
                        paint.set_alpha_f(layer_img.opacity);
                    }
                    let cg_blend: crate::cg::types::BlendMode = layer_img.blend_mode.into();
                    let sk_blend: skia_safe::BlendMode = cg_blend.into();
                    paint.set_blend_mode(sk_blend);

                    if layer_img.is_atlas_backed() {
                        // Atlas path: same-texture sub-rect blit.
                        if let Some((atlas_image, src_rect)) =
                            self.compositor_atlas.get_image_and_src_rect(id)
                        {
                            canvas.draw_image_rect(
                                atlas_image,
                                Some((&src_rect, skia_safe::canvas::SrcRectConstraint::Fast)),
                                dst,
                                &paint,
                            );
                        }
                    } else if let Some(img) = layer_img.individual_image() {
                        // Individual texture path.
                        let src = Rect::new(
                            0.0,
                            0.0,
                            img.width() as f32,
                            img.height() as f32,
                        );
                        canvas.draw_image_rect(
                            img,
                            Some((&src, skia_safe::canvas::SrcRectConstraint::Fast)),
                            dst,
                            &paint,
                        );
                    }
                    layer_image_cache_hits += 1;
                }
            }
        }

        // Draw live (non-promoted) layers via the Painter.
        // Promoted nodes are skipped — they were already blitted above.
        // Skip entirely when all visible nodes are promoted — no live work needed.
        let has_live_work = plan.regions.iter().any(|(_, indices)| !indices.is_empty());
        let promoted_skip = if promoted_set.is_empty() {
            None
        } else {
            Some(&promoted_set)
        };
        let cache_picture_used = if has_live_work {
            self.draw_layers_with_scene_cache_skip(canvas, plan, promoted_skip)
        } else {
            0
        };

        let __painter_duration = __before_paint.elapsed();

        canvas.restore();

        let compositor_stats = self.scene_cache.compositor.stats();

        DrawResult {
            painter_duration: __painter_duration,
            cache_picture_used,
            cache_picture_size: self.scene_cache.picture.len(),
            cache_geometry_size: self.scene_cache.geometry.len(),
            layer_image_cache_size: compositor_stats.promoted_count,
            layer_image_cache_hits,
            layer_image_cache_bytes: compositor_stats.memory_bytes,
            live_draw_count: plan.regions.iter().map(|(_, indices)| indices.len()).sum(),
        }
        //
    }

    /// Render the scene into a pre-created downscaled offscreen, then
    /// upscale to the display canvas with bilinear filtering.
    fn draw_to_offscreen_and_upscale(
        &mut self,
        canvas: &Canvas,
        offscreen: &mut Surface,
        plan: &FramePlan,
        background_color: Option<CGColor>,
        display_w: f32,
        display_h: f32,
        scaled_w: i32,
        scaled_h: i32,
        scale: f32,
    ) -> Option<DrawResult> {
        let __before_paint = Instant::now();
        let off_canvas = offscreen.canvas();

        // Clear and draw background at reduced resolution.
        off_canvas.clear(skia_safe::Color::TRANSPARENT);
        Self::clear_and_paint_background(
            off_canvas,
            background_color,
            scaled_w as f32,
            scaled_h as f32,
        );

        off_canvas.save();

        // Scale down the camera transform to match reduced resolution.
        off_canvas.scale((scale, scale));
        off_canvas.concat(&sk::sk_matrix(self.camera.view_matrix().matrix));

        // Blit promoted (compositor-cached) nodes.
        let mut layer_image_cache_hits = 0usize;
        let promoted_set: std::collections::HashSet<NodeId> =
            plan.promoted.iter().copied().collect();
        for id in &plan.promoted {
            if let Some(layer_img) = self.scene_cache.compositor.get(id) {
                let b = &layer_img.local_bounds;
                let dst = Rect::from_xywh(b.x, b.y, b.width, b.height);
                let mut paint = SkPaint::default();
                if layer_img.opacity < 1.0 {
                    paint.set_alpha_f(layer_img.opacity);
                }
                let cg_blend: crate::cg::types::BlendMode = layer_img.blend_mode.into();
                let sk_blend: skia_safe::BlendMode = cg_blend.into();
                paint.set_blend_mode(sk_blend);

                if layer_img.is_atlas_backed() {
                    if let Some((atlas_image, src_rect)) =
                        self.compositor_atlas.get_image_and_src_rect(id)
                    {
                        off_canvas.draw_image_rect(
                            atlas_image,
                            Some((&src_rect, skia_safe::canvas::SrcRectConstraint::Fast)),
                            dst,
                            &paint,
                        );
                    }
                } else if let Some(img) = layer_img.individual_image() {
                    let src = Rect::new(0.0, 0.0, img.width() as f32, img.height() as f32);
                    off_canvas.draw_image_rect(
                        img,
                        Some((&src, skia_safe::canvas::SrcRectConstraint::Fast)),
                        dst,
                        &paint,
                    );
                }
                layer_image_cache_hits += 1;
            }
        }

        // Draw live (non-promoted) layers at reduced resolution.
        // Promoted nodes are skipped — they were already blitted above.
        let has_live_work = plan.regions.iter().any(|(_, indices)| !indices.is_empty());
        let promoted_skip = if promoted_set.is_empty() {
            None
        } else {
            Some(&promoted_set)
        };
        let cache_picture_used = if has_live_work {
            self.draw_layers_with_scene_cache_skip(off_canvas, plan, promoted_skip)
        } else {
            0
        };

        off_canvas.restore();

        // Upscale to display canvas with bilinear filtering.
        let image = offscreen.image_snapshot();
        canvas.clear(skia_safe::Color::TRANSPARENT);
        let sampling = skia_safe::SamplingOptions::new(
            skia_safe::FilterMode::Linear,
            skia_safe::MipmapMode::None,
        );
        let mut paint = SkPaint::default();
        paint.set_anti_alias(false);
        canvas.draw_image_rect_with_sampling_options(
            &image,
            Some((
                &Rect::from_wh(scaled_w as f32, scaled_h as f32),
                skia_safe::canvas::SrcRectConstraint::Fast,
            )),
            Rect::new(0.0, 0.0, display_w, display_h),
            sampling,
            &paint,
        );

        let __painter_duration = __before_paint.elapsed();
        let compositor_stats = self.scene_cache.compositor.stats();

        Some(DrawResult {
            painter_duration: __painter_duration,
            cache_picture_used,
            cache_picture_size: self.scene_cache.picture.len(),
            cache_geometry_size: self.scene_cache.geometry.len(),
            layer_image_cache_size: compositor_stats.promoted_count,
            layer_image_cache_hits,
            layer_image_cache_bytes: compositor_stats.memory_bytes,
            live_draw_count: plan.regions.iter().map(|(_, indices)| indices.len()).sum(),
        })
    }

    /// Draw the scene to the canvas.
    /// - canvas: the canvas to render to
    /// - plan: the frame plan
    /// - width: the width of the canvas
    /// - height: the height of the canvas
    fn draw_nocache(
        &self,
        canvas: &Canvas,
        _plan: &FramePlan,
        background_color: Option<CGColor>,
        width: f32,
        height: f32,
    ) -> DrawResult {
        let __before_paint = Instant::now();

        canvas.clear(skia_safe::Color::TRANSPARENT);

        // Paint background color first if present
        if let Some(bg_color) = background_color {
            let color: skia_safe::Color = bg_color.into();
            let mut paint = SkPaint::default();
            paint.set_color(color);
            // Paint the entire canvas with the background color
            canvas.draw_rect(Rect::new(0.0, 0.0, width, height), &paint);
        }

        canvas.save();

        // Apply camera transform
        canvas.concat(&sk::sk_matrix(self.camera.view_matrix().matrix));

        // Always use the command pipeline for export to ensure masks are applied.
        let painter = Painter::new_with_scene_cache(
            canvas,
            &self.fonts,
            &self.images,
            &self.scene_cache,
            self.config.render_policy,
        );
        painter.draw_layer_list(&self.scene_cache.layers);

        let __painter_duration = __before_paint.elapsed();

        canvas.restore();

        DrawResult {
            painter_duration: __painter_duration,
            cache_picture_used: 0,
            cache_picture_size: 0,
            cache_geometry_size: 0,
            layer_image_cache_size: 0,
            layer_image_cache_hits: 0,
            layer_image_cache_bytes: 0,
            live_draw_count: 0,
        }
        //
    }

    pub fn snapshot(&self) -> Image {
        let surface = unsafe { &mut *self.backend.get_surface() };

        let width = surface.width() as f32;
        let height = surface.height() as f32;
        let mut canvas = surface.canvas();
        // Export/snapshot: not an interactive frame, so no camera change.
        let frame = self.frame(self.camera.rect(), 1.0, true, CameraChangeKind::None);
        let _ = self.draw_nocache(&mut canvas, &frame, None, width, height);

        surface.image_snapshot()
    }

    /// Render the current scene onto the provided canvas. This is useful for
    /// exporting the scene using alternate backends such as PDF.
    pub fn render_to_canvas(&self, canvas: &Canvas, width: f32, height: f32) {
        // Export: not an interactive frame, so no camera change.
        let frame = self.frame(self.camera.rect(), 1.0, true, CameraChangeKind::None);
        let background = self.scene.as_ref().and_then(|s| s.background_color);
        let _ = self.draw_nocache(canvas, &frame, background, width, height);
    }

    /// Capture (or re-capture) layer images for promoted nodes.
    ///
    /// Called every frame when layer compositing is enabled (GPU only).
    /// A **single shared GPU surface** (`self.compositor_surface`) is reused
    /// for all node captures — one FBO allocation, amortised across all
    /// nodes and all frames.  For each eligible node the surface is cleared,
    /// the node is drawn, and `image_snapshot_with_bounds` grabs the
    /// sub-region as a GPU-resident `SkImage`.  No per-node surface
    /// allocation.
    ///
    /// Eligible visible nodes are rasterised within a per-frame time budget
    /// during unstable (interactive) frames, and without limit on stable
    /// (settled) frames. Stale entries (zoom mismatch) are blitted with
    /// GPU texture stretching until re-rasterized.
    fn update_compositor(&mut self, parent_surface: &mut Surface) {
        self.update_compositor_inner(parent_surface, false);
    }

    /// Variant called on stable frames — no time budget, all stale entries
    /// are re-rasterized to achieve full quality at the final zoom.
    fn update_compositor_stable(&mut self, parent_surface: &mut Surface) {
        self.update_compositor_inner(parent_surface, true);
    }

    /// Core compositor update logic.
    ///
    /// When `force_all` is true (stable frame), all stale/dirty entries are
    /// re-rasterized without a time budget. When false (unstable/interactive
    /// frame), re-rasterization is capped to `ZOOM_RERASTER_BUDGET` to keep
    /// frame times low.
    fn update_compositor_inner(&mut self, parent_surface: &mut Surface, force_all: bool) {
        use crate::cache::compositor::promotion;

        let zoom = self.camera.get_zoom();

        self.scene_cache.compositor.tick_frame();

        // --- Lazily allocate or reuse the shared offscreen surface ---------
        if self.compositor_surface.is_none() {
            let info = skia_safe::ImageInfo::new_n32_premul(
                (COMPOSITOR_SURFACE_SIZE, COMPOSITOR_SURFACE_SIZE),
                None,
            );
            self.compositor_surface = parent_surface.new_surface(&info);
            if self.compositor_surface.is_none() {
                return; // GPU surface creation failed — skip compositing
            }
        }

        // Only process layers visible in the current viewport.
        let viewport_rect = self.camera.rect();
        let visible_indices = self.scene_cache.intersects(viewport_rect);
        let visible_set: std::collections::HashSet<usize> =
            visible_indices.into_iter().collect();

        // Time budget for stale re-rasterization during interactive frames.
        // 8ms leaves headroom within a 16ms frame budget (60fps target).
        const ZOOM_RERASTER_BUDGET: std::time::Duration =
            std::time::Duration::from_micros(8000);
        let budget_start = std::time::Instant::now();

        // Zoom scale bucket ratio — only re-rasterize when the zoom drift
        // exceeds this threshold. Within the bucket, the GPU stretch is
        // visually acceptable.
        const RASTER_ZOOM_RATIO: f32 = 1.5;

        for (idx, entry) in self.scene_cache.layers.layers.iter().enumerate() {
            if !visible_set.contains(&idx) {
                continue;
            }

            let id = entry.id;

            // Decide whether this node needs (re-)rasterization.
            //
            //  State        | Unstable frame          | Stable frame (force_all)
            //  -------------|-------------------------|-------------------------
            //  Fresh        | skip                    | skip
            //  Stale+bucket | skip (stretch OK)       | re-raster (full quality)
            //  Stale+beyond | re-raster (within budget)| re-raster
            //  Dirty        | re-raster               | re-raster
            //  Missing      | raster (new entry)      | raster (new entry)
            if let Some(img) = self.scene_cache.compositor.peek(&id) {
                if !img.dirty && !img.stale {
                    // Completely fresh — nothing to do.
                    continue;
                }
                if img.stale && !img.dirty {
                    // Guard against zero/degenerate cached zoom.
                    let ratio = if img.zoom > f32::EPSILON {
                        zoom / img.zoom
                    } else {
                        f32::MAX
                    };
                    let bucket_min = 1.0 / RASTER_ZOOM_RATIO;
                    let within_bucket = (bucket_min..=RASTER_ZOOM_RATIO).contains(&ratio);
                    if within_bucket && !force_all {
                        // GPU stretch is visually acceptable — skip.
                        continue;
                    }
                }
            }

            // Check time budget for interactive frames.
            if !force_all && budget_start.elapsed() >= ZOOM_RERASTER_BUDGET {
                break; // Budget exhausted — remaining stale nodes stay stretched.
            }

            let Some(render_bounds) = self.scene_cache.geometry.get_render_bounds(&id) else {
                continue;
            };

            let screen_area = render_bounds.width * zoom * render_bounds.height * zoom;
            let memory_available = self.scene_cache.compositor.has_budget();

            let status = promotion::should_promote(
                &entry.layer,
                &render_bounds,
                screen_area,
                false,
                memory_available,
            );

            if !status.is_promoted() {
                if self.scene_cache.compositor.is_promoted(&id) {
                    self.scene_cache.compositor.remove(&id);
                    self.compositor_atlas.free_node(&id);
                }
                continue;
            }

            // Compute pixel dimensions in screen space by applying zoom
            // so cached images match the actual display resolution.
            let pixel_width = (render_bounds.width * zoom).ceil() as i32;
            let pixel_height = (render_bounds.height * zoom).ceil() as i32;

            if pixel_width <= 0 || pixel_height <= 0 {
                continue;
            }

            // Skip nodes larger than the shared surface.
            if pixel_width > COMPOSITOR_SURFACE_SIZE || pixel_height > COMPOSITOR_SURFACE_SIZE {
                continue;
            }

            let base = match &entry.layer {
                crate::painter::layer::PainterPictureLayer::Shape(s) => &s.base,
                crate::painter::layer::PainterPictureLayer::Text(t) => &t.base,
                crate::painter::layer::PainterPictureLayer::Vector(v) => &v.base,
            };
            let node_opacity = base.opacity;
            let node_blend = base.blend_mode;

            // --- Atlas path: pack into shared texture for batch-friendly blitting ---
            if self.config.compositor_atlas {
                // Create the atlas page surface upfront (before borrowing self).
                let needs_new_page = !self.compositor_atlas.has_node(&id) && {
                    // Check if any existing page can fit this node.
                    let can_fit = (0..self.compositor_atlas.page_count()).any(|i| {
                        self.compositor_atlas
                            .page(i as u32)
                            .and_then(|p| {
                                // Peek at whether allocation would succeed without mutating.
                                // We can't call allocate yet, so check size constraints.
                                if pixel_width as u32 <= p.width()
                                    && pixel_height as u32 <= p.height()
                                {
                                    Some(())
                                } else {
                                    None
                                }
                            })
                            .is_some()
                    });
                    !can_fit
                };

                let new_page_surface = if needs_new_page {
                    let cfg = cache::atlas::atlas_set::AtlasSetConfig::default();
                    let info = skia_safe::ImageInfo::new_n32_premul(
                        (cfg.page_width as i32, cfg.page_height as i32),
                        None,
                    );
                    parent_surface.new_surface(&info)
                } else {
                    None
                };

                let atlas_ok = self
                    .compositor_atlas
                    .allocate(id, pixel_width as u32, pixel_height as u32, |w, h| {
                        // This closure is only called when a new page is needed.
                        // We pre-created the surface above to avoid the borrow conflict.
                        if let Some(s) = new_page_surface {
                            Some(s)
                        } else {
                            // Shouldn't reach here if our needs_new_page check was correct,
                            // but fall back to creating from the compositor surface.
                            let info = skia_safe::ImageInfo::new_n32_premul(
                                (w as i32, h as i32),
                                None,
                            );
                            self.compositor_surface.as_mut().and_then(|cs| cs.new_surface(&info))
                        }
                    })
                    .is_some();

                if atlas_ok {
                    let entry_layer = entry.layer.clone();
                    let fonts = &self.fonts;
                    let images = &self.images;
                    let scene_cache = &self.scene_cache;
                    let policy = self.config.render_policy;
                    self.compositor_atlas.draw_into_slot(&id, |slot_canvas| {
                        slot_canvas.clear(skia_safe::Color::TRANSPARENT);
                        // Scale to match the zoom-scaled pixel dimensions of
                        // the atlas slot, then translate so the node's
                        // world-space render bounds start at the origin.
                        slot_canvas.scale((zoom, zoom));
                        slot_canvas.translate((-render_bounds.x, -render_bounds.y));
                        let painter = Painter::new_with_scene_cache(
                            slot_canvas, fonts, images, scene_cache, policy,
                        );
                        painter.draw_layer(&entry_layer);
                    });

                    self.scene_cache.compositor.insert_atlas(
                        id,
                        pixel_width as u32,
                        pixel_height as u32,
                        zoom,
                        render_bounds,
                        node_opacity,
                        node_blend,
                    );
                    continue;
                }
                // Atlas allocation failed — fall through to individual capture.
            }

            // --- Individual texture path: snapshot into per-node SkImage ---
            {
                let offscreen = self.compositor_surface.as_mut().unwrap();
                let off_canvas = offscreen.canvas();

                off_canvas.restore_to_count(0);
                off_canvas.save();
                off_canvas.clip_rect(
                    Rect::from_wh(pixel_width as f32, pixel_height as f32),
                    None,
                    None,
                );
                off_canvas.clear(skia_safe::Color::TRANSPARENT);
                // Scale to match the zoom-scaled pixel dimensions of
                // the capture surface, then translate so the node's
                // world-space render bounds start at the origin.
                off_canvas.scale((zoom, zoom));
                off_canvas.translate((-render_bounds.x, -render_bounds.y));

                let painter = Painter::new_with_scene_cache(
                    off_canvas,
                    &self.fonts,
                    &self.images,
                    &self.scene_cache,
                    self.config.render_policy,
                );
                painter.draw_layer(&entry.layer);

                off_canvas.restore();

                let bounds = skia_safe::IRect::from_wh(pixel_width, pixel_height);
                if let Some(image) = offscreen.image_snapshot_with_bounds(bounds) {
                    self.scene_cache.compositor.insert(
                        id, image, zoom, render_bounds, node_opacity, node_blend,
                    );
                }
            }
        }

    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::node::{
        factory::NodeFactory,
        scene_graph::{Parent, SceneGraph},
        schema::Size,
    };

    #[test]
    fn picture_recorded_with_layer_bounds() {
        let nf = NodeFactory::new();

        let mut rect = nf.create_rectangle_node();
        rect.size = Size {
            width: 50.0,
            height: 40.0,
        };

        let mut graph = SceneGraph::new();
        let rect_id = graph.append_child(Node::Rectangle(rect), Parent::Root);

        let scene = Scene {
            name: "test".into(),
            graph,
            background_color: None,
        };

        let mut renderer = Renderer::new(
            Backend::new_from_raster(100, 100),
            None,
            Camera2D::new(Size {
                width: 100.0,
                height: 100.0,
            }),
        );
        renderer.load_scene(scene);
        renderer.queue_stable();
        renderer.flush();

        let bounds = renderer
            .scene_cache
            .geometry
            .get_render_bounds(&rect_id)
            .expect("bounds not found");
        let pic = renderer
            .scene_cache
            .picture
            .get_node_picture(&rect_id)
            .expect("picture not cached");

        let cull = pic.cull_rect();
        assert_eq!(cull.left(), bounds.x);
        assert_eq!(cull.top(), bounds.y);
        assert_eq!(cull.width(), bounds.width);
        assert_eq!(cull.height(), bounds.height);

        renderer.free();
    }

    #[test]
    fn recording_cached_returns_none_without_bounds() {
        let mut renderer = Renderer::new(
            Backend::new_from_raster(50, 50),
            None,
            Camera2D::new(Size {
                width: 50.0,
                height: 50.0,
            }),
        );

        // no scene loaded so geometry cache is empty
        let pic = renderer.with_recording_cached(&9999, 0, |_| {});
        assert!(pic.is_none());

        renderer.free();
    }

    #[test]
    fn renderer_tracks_missing_fonts_from_scene() {
        let nf = NodeFactory::new();

        let mut text = nf.create_text_span_node();
        text.text_style.font_family = "MissingFont".into();

        let mut graph = SceneGraph::new();
        graph.append_child(Node::TextSpan(text), Parent::Root);

        let scene = Scene {
            name: "test".into(),
            graph,
            background_color: None,
        };

        let mut renderer = Renderer::new(
            Backend::new_from_raster(100, 100),
            None,
            Camera2D::new(Size {
                width: 100.0,
                height: 100.0,
            }),
        );
        renderer.load_scene(scene);

        assert!(renderer.fonts.has_missing());
        assert_eq!(
            renderer
                .fonts
                .missing_families()
                .into_iter()
                .collect::<Vec<_>>(),
            vec!["MissingFont".to_string()]
        );

        renderer.free();
    }

    /// Verify that layer compositing is silently skipped on a raster (CPU)
    /// backend — the config is accepted but the compositor stays empty.
    #[test]
    fn layer_compositing_skipped_on_raster_backend() {
        let nf = NodeFactory::new();
        let mut rect = nf.create_rectangle_node();
        rect.size = Size {
            width: 200.0,
            height: 200.0,
        };

        let mut graph = SceneGraph::new();
        graph.append_child(Node::Rectangle(rect), Parent::Root);

        let scene = Scene {
            name: "compositor_raster_test".into(),
            graph,
            background_color: None,
        };

        let mut renderer = Renderer::new(
            Backend::new_from_raster(500, 500),
            None,
            Camera2D::new(Size {
                width: 500.0,
                height: 500.0,
            }),
        );
        renderer.set_layer_compositing(true);
        renderer.load_scene(scene);

        assert!(!renderer.backend.is_gpu(), "test requires raster backend");

        // Two stable frames — compositor must stay empty on CPU.
        renderer.queue_stable();
        let _ = renderer.flush();
        renderer.queue_stable();
        let result = renderer.flush();

        let stats = match result {
            FrameFlushResult::OK(s) => s,
            other => panic!("Expected OK, got {:?}", std::mem::discriminant(&other)),
        };

        assert_eq!(
            stats.draw.layer_image_cache_size, 0,
            "compositor must not populate on raster backend"
        );
        assert_eq!(
            stats.draw.layer_image_cache_hits, 0,
            "no hits expected on raster backend"
        );

        renderer.free();
    }
}
