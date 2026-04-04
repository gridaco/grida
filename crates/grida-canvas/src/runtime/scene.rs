use crate::cg::prelude::*;
use crate::node::{scene_graph::SceneGraph, schema::*};
use crate::painter::Painter;
use crate::runtime::camera::CameraChangeKind;
use crate::runtime::changes::{ChangeFlags, ChangeSet};
use crate::runtime::counter::FrameCounter;
use crate::runtime::frame_strategy::FrameRenderStrategy;
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
    surfaces, Canvas, Color, FilterMode, Image, MipmapMode, Paint as SkPaint, Picture,
    PictureRecorder, Rect, SamplingOptions, Surface,
};
use std::collections::HashSet;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

// ---------------------------------------------------------------------------
// Renderer tuning constants
// ---------------------------------------------------------------------------

/// Zoom scale bucket ratio for the compositor raster cache.
///
/// A cached node image is reused (GPU-stretched) as long as the current zoom
/// stays within this factor of the zoom at which the image was rasterized.
/// Once the drift exceeds this ratio in either direction the node is
/// re-rasterized (subject to the per-frame time budget on interactive frames,
/// or immediately on stable frames).
///
/// Set to 2.0 to match Chromium's `kMaxScaleRatioDuringPinch`: tiles are
/// reused until the zoom drifts more than 2× from the cached scale, then
/// re-rasterization is triggered.
///
/// Raising this value reduces re-rasterization frequency (smoother
/// interaction, blurrier stretched content). Lowering it increases sharpness
/// at the cost of more frequent re-rasters.
const RASTER_ZOOM_RATIO: f32 = 2.0;

// ---------------------------------------------------------------------------

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

/// Options controlling renderer behaviour at construction time.
///
/// Passed through the entire init chain: TS → C ABI → Application → Renderer.
/// Fields here are applied once during construction. Most can also be changed
/// at runtime via individual setters on `Renderer` / `ApplicationApi`.
#[derive(Clone, Copy)]
pub struct RendererOptions {
    /// When true, embedded fonts (Geist, GeistMono) will be registered.
    pub use_embedded_fonts: bool,
    /// When true, the platform's system font manager is added as the default
    /// fallback. This enables Skia's built-in font fallback for scripts not
    /// covered by explicitly registered fonts (e.g. CJK via system-installed
    /// Noto Sans).
    ///
    /// **Default: `false`** — matches the WASM/web environment where only
    /// explicitly provided fonts are available. Set to `true` in native-only
    /// dev tools (grida-dev `--system-fonts`) for convenient local previewing.
    pub use_system_fonts: bool,
    /// Initial renderer configuration. Applied at construction; individual
    /// fields remain mutable via `Renderer::set_*` / `ApplicationApi` setters.
    pub config: super::config::RuntimeRendererConfig,
}

impl Default for RendererOptions {
    fn default() -> Self {
        Self {
            use_embedded_fonts: false,
            use_system_fonts: false,
            config: Default::default(),
        }
    }
}

pub fn collect_scene_font_families(scene: &Scene) -> HashSet<String> {
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
    /// World-space viewport rectangle used for the R-tree query.
    /// Stored explicitly for downstream use (viewport culling construction,
    /// future RenderSurface geometric culling).
    pub viewport: rect::Rectangle,
    /// Node IDs that will be drawn via cached layer images (compositor blit).
    pub promoted: Vec<NodeId>,
    /// regions with their intersecting indices (live-drawn nodes only)
    pub regions: Vec<(rect::Rectangle, Vec<usize>)>,
    /// Visible layer indices with promotable effects (shadows, blur, noise).
    /// Pre-filtered from the R-tree query so the compositor iterates only
    /// nodes that may need promotion, avoiding a redundant R-tree query
    /// and the per-node `has_promotable_effects` check.
    pub compositor_indices: Vec<usize>,
    pub display_list_duration: Duration,
    pub display_list_size_estimated: usize,
    /// Predicted frame cost in microseconds, based on the fixed-overhead cost
    /// model (sum of per-effect FBO/pipeline costs for visible nodes).
    /// See `docs/wg/feat-2d/render-cost-prediction.md` for derivation.
    /// Zero for cache-hit frames (pan/zoom blit).
    pub predicted_cost_us: f64,
}

/// Deferred frame plan: stores just the inputs so the expensive R-tree query
/// and sort can be skipped when a cache (pan or zoom) will satisfy the frame.
///
/// When the cache misses at flush time, the full `FramePlan` is computed from
/// these stored inputs. This eliminates ~400-500µs of wasted R-tree work on
/// cache-hit frames for large scenes (136K+ nodes).
struct DeferredPlan {
    bounds: rect::Rectangle,
    zoom: f32,
    stable: bool,
    camera_change: CameraChangeKind,
}

/// Either a fully computed plan or a deferred one awaiting materialization.
enum PlanState {
    /// Fully computed — R-tree query and sort already done.
    Ready(FramePlan),
    /// Deferred — will be computed in flush() only if cache misses.
    Deferred(DeferredPlan),
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

// Note: PAN_IMAGE_CACHE_MAX_OFFSET has been removed. The pan cache now
// blits at any offset (up to viewport size) and recaptures every frame.
// No threshold-based invalidation — the settle frame handles full-quality
// rendering after the gesture ends.

// NOTE: The zoom image cache no longer has a hard eviction ratio.  During
// active interaction, the cached texture is stretched at any zoom ratio —
// blurry content is acceptable and avoids catastrophic full-draw spikes.
// The settle frame always produces a full-quality render at the correct
// zoom level.  See optimization.md item 21/22.

/// Cached GPU snapshot of the composited frame for pan-only fast path.
///
/// During pan-only camera changes (the most common interaction), the scene
/// graph is static and zoom is constant — only the viewport translation
/// changes. Instead of re-drawing every visible node each frame, we capture
/// the composited frame as a GPU texture and blit it at the new camera
/// offset. This replaces O(N) draw commands with a single texture blit.
struct PanImageCache {
    /// GPU texture snapshot of the composited frame.
    image: Image,
    /// View matrix translation components at capture time.
    origin_tx: f32,
    origin_ty: f32,
}

/// Cached GPU snapshot for zoom fast path (items 21/22/25 in optimization.md).
///
/// During active zooming the scene graph is static — only the zoom level
/// changes. Instead of re-drawing every visible node, we scale the cached
/// frame texture by the zoom ratio. This replaces O(N) draw commands with
/// a single scaled texture blit.
///
/// The scaled image is slightly blurry at wrong-scale, which is acceptable
/// during unstable (interaction) frames. The stable frame after interaction
/// ends always produces a full-quality render.
struct ZoomImageCache {
    /// GPU texture snapshot of the composited frame.
    image: Image,
    /// Full view matrix at capture time (includes translation + zoom).
    view_matrix: math2::transform::AffineTransform,
}

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
    /// the frame plan for the next frame, to be drawn and flushed.
    /// May be deferred (lazy) to skip R-tree query on cache-hit frames.
    plan: Option<PlanState>,
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
    /// Cached composited frame for pan-only fast path.
    /// See [`PanImageCache`] for details.
    pan_image_cache: Option<PanImageCache>,
    /// Cached composited frame for zoom fast path.
    /// See [`ZoomImageCache`] for details.
    zoom_image_cache: Option<ZoomImageCache>,
    /// Accumulated changes since the last frame.
    ///
    /// Mutation sites call [`mark_changed`] to declare what changed;
    /// [`apply_changes`] consumes the set once per frame and performs
    /// the correct invalidation for every cache layer.
    changes: ChangeSet,
    /// Picture cache generation + variant key at the time of the last
    /// successful prefill. When the cache generation and variant key
    /// match, the prefill loop can be skipped entirely — all pictures
    /// are already cached from a previous frame.
    last_prefill_generation: u64,
    last_prefill_variant_key: u64,
    last_prefill_layer_count: usize,
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

    /// Build a [`FrameRenderStrategy`] from the current renderer state.
    ///
    /// This is the **only** place that translates renderer state into
    /// per-frame policy decisions. All call sites in the rendering pipeline
    /// read the returned struct instead of re-deriving conditions from raw
    /// config fields, zoom level, or backend type.
    fn frame_strategy(&self, stable: bool, camera_change: CameraChangeKind) -> FrameRenderStrategy {
        FrameRenderStrategy::compute(
            self.camera.get_zoom(),
            self.backend.is_gpu(),
            stable,
            camera_change,
            &self.config,
            self.pan_image_cache.is_some(),
            self.zoom_image_cache.is_some(),
        )
    }

    #[inline]
    fn prefill_picture_cache_for_plan(&mut self, plan: &FramePlan, policy: RenderPolicy) {
        let variant_key = policy.variant_key();
        // Pre-compute whether variant key unification is safe for this policy.
        // True when the policy differs from STANDARD only in effect-related
        // fields — content, compositing, and clip policies are unchanged.
        let can_unify = variant_key != 0 && policy.is_effect_only_variant();

        // Skip-prefill fast path: when the picture cache generation hasn't
        // changed since the last prefill AND we're using the same variant
        // key AND the layer count matches, every picture from the previous
        // prefill is still valid. Skip the O(N) iteration entirely.
        //
        // For variant key tracking: when can_unify is true AND the variant
        // store is empty (no per-variant entries — all nodes are effect-free),
        // we track key=0 since all pictures live under the default key. This
        // is safe across stable/unstable transitions for effect-free scenes.
        // Scenes WITH effects track the actual variant_key.
        //
        // On 135K-node scenes at fit zoom, this eliminates ~800µs of HashMap
        // lookups on every cache-warm frame (the common case during view-only
        // pan/zoom interaction and settle frames).
        let effective_key_for_tracking =
            if can_unify && self.scene_cache.picture.variant_store_is_empty() {
                0
            } else {
                variant_key
            };

        let current_gen = self.scene_cache.picture.generation();
        let layer_count: usize = plan.regions.iter().map(|(_, idx)| idx.len()).sum();
        if current_gen == self.last_prefill_generation
            && effective_key_for_tracking == self.last_prefill_variant_key
            && layer_count == self.last_prefill_layer_count
        {
            return;
        }

        // Prefill picture cache for visible layers so Painter can reuse pictures even with masks.
        // Fast path: skip clone + recording when the picture is already cached (common case
        // on cache-warm frames). The clone of LayerEntry is expensive because it deep-copies
        // fills, strokes, effects, paths, etc.
        for (_region, indices) in &plan.regions {
            for idx in indices {
                if let Some(entry) = self.scene_cache.layers.layers.get(*idx) {
                    let id = entry.id;
                    // Variant key unification for effects-free nodes.
                    //
                    // When a node has no effects (no blur, shadow, noise, glass,
                    // backdrop blur), the SkPicture recorded under the "reduced
                    // effects" policy (unstable frames) is byte-identical to the
                    // "full quality" policy (stable frames). Storing such nodes
                    // under the default variant key (0) avoids redundant
                    // re-recording when the renderer switches between unstable
                    // and stable frames — the first frame records the picture,
                    // and the settle frame finds it immediately.
                    //
                    // On yrr-main (135K nodes, 0 effects), this eliminates ~800 us
                    // of LayerEntry clones + SkPicture recordings on every settle.
                    let effective_key = if can_unify && entry.layer.effects_empty() {
                        0
                    } else {
                        variant_key
                    };
                    // Check cache before cloning — avoids expensive deep clone on cache hits.
                    if self
                        .scene_cache
                        .picture
                        .get_node_picture_variant(&id, effective_key)
                        .is_some()
                    {
                        continue;
                    }
                    // Cache miss — clone and record.
                    let entry = entry.clone();
                    let _ = self.with_recording_cached_with_policy(
                        &id,
                        effective_key,
                        policy,
                        |painter| {
                            painter.draw_layer(&entry.layer);
                        },
                    );
                }
            }
        }

        // Update tracking state for future skip-prefill checks.
        let effective_key_after = if can_unify && self.scene_cache.picture.variant_store_is_empty()
        {
            0
        } else {
            variant_key
        };
        self.last_prefill_generation = self.scene_cache.picture.generation();
        self.last_prefill_variant_key = effective_key_after;
        self.last_prefill_layer_count = layer_count;
    }

    /// Pre-extract blit data for all promoted nodes.
    ///
    /// Iterates through the promoted node list and extracts the image,
    /// source rect, destination rect, opacity, and blend mode for each node.
    /// The resulting map is passed to the Painter so it can blit promoted
    /// nodes inline at their correct z-position in the render command tree.
    fn build_promoted_blits(
        &mut self,
        plan: &FramePlan,
    ) -> (
        crate::cache::fast_hash::NodeIdHashMap<NodeId, crate::painter::PromotedBlit>,
        usize,
    ) {
        let mut blits = crate::cache::fast_hash::new_node_id_map();
        let mut cache_hits = 0usize;

        for id in &plan.promoted {
            if let Some(layer_img) = self.scene_cache.compositor.get(id) {
                let b = &layer_img.local_bounds;
                let dst_rect = Rect::from_xywh(b.x, b.y, b.width, b.height);
                let opacity = layer_img.opacity;
                let cg_blend: crate::cg::types::BlendMode = layer_img.blend_mode.into();
                let sk_blend: skia_safe::BlendMode = cg_blend.into();

                let blit = if layer_img.is_atlas_backed() {
                    // Atlas path: same-texture sub-rect blit.
                    if let Some((atlas_image, src_rect)) =
                        self.compositor_atlas.get_image_and_src_rect(id)
                    {
                        Some(crate::painter::PromotedBlit {
                            image: std::rc::Rc::new(atlas_image.clone()),
                            src_rect,
                            dst_rect,
                            opacity,
                            blend_mode: sk_blend,
                        })
                    } else {
                        None
                    }
                } else if let Some(img) = layer_img.individual_image() {
                    // Individual texture path.
                    let src_rect = Rect::new(0.0, 0.0, img.width() as f32, img.height() as f32);
                    Some(crate::painter::PromotedBlit {
                        image: std::rc::Rc::clone(img),
                        src_rect,
                        dst_rect,
                        opacity,
                        blend_mode: sk_blend,
                    })
                } else {
                    None
                };

                if let Some(blit) = blit {
                    blits.insert(*id, blit);
                    cache_hits += 1;
                }
            }
        }

        (blits, cache_hits)
    }

    #[inline]
    fn draw_layers_with_scene_cache(&mut self, canvas: &Canvas, plan: &FramePlan) -> usize {
        self.draw_layers_with_scene_cache_skip(canvas, plan, None)
    }

    fn draw_layers_with_scene_cache_skip(
        &mut self,
        canvas: &Canvas,
        plan: &FramePlan,
        promoted_blits: Option<
            &crate::cache::fast_hash::NodeIdHashMap<NodeId, crate::painter::PromotedBlit>,
        >,
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

        // Build the viewport culling context from the frame plan.
        // This enables the draw loop to skip off-screen Draw commands with
        // a ~1ns bitset check instead of dispatching each to Skia (~0.5µs).
        let viewport_cull = crate::painter::ViewportCull::from_plan(plan, &self.scene_cache.layers);

        let painter = Painter::new_with_scene_cache(
            canvas,
            &self.fonts,
            &self.images,
            &self.scene_cache,
            policy,
        );
        let painter = painter.with_viewport_cull(&viewport_cull);
        let painter = if let Some(blits) = promoted_blits {
            painter.with_promoted_blits(blits)
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
        if options.use_system_fonts {
            font_repository.enable_system_fallback();
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
            config: options.config,
            layout_engine: crate::layout::engine::LayoutEngine::new(),
            window_context: RendererWindowContext::new(viewport_size),
            compositor_surface: None,
            compositor_atlas: cache::atlas::atlas_set::AtlasSet::new(
                cache::atlas::atlas_set::AtlasSetConfig::default(),
            ),
            downscale_surface: None,
            downscale_dims: (0, 0),
            pan_image_cache: None,
            zoom_image_cache: None,
            changes: ChangeSet::new(),
            last_prefill_generation: u64::MAX,
            last_prefill_variant_key: u64::MAX,
            last_prefill_layer_count: 0,
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
        self.update_layer_text_inner(node_id, text, None);
    }

    /// Update the text content for an attributed text node, replacing
    /// both the plain text and the full `AttributedString` (text + runs).
    ///
    /// This keeps the run byte offsets in sync with the backing string,
    /// preventing out-of-bounds panics in the paragraph cache.
    pub fn update_layer_attributed_text(
        &mut self,
        node_id: NodeId,
        text: &str,
        attributed: crate::cg::types::AttributedString,
    ) {
        self.update_layer_text_inner(node_id, text, Some(attributed));
    }

    fn update_layer_text_inner(
        &mut self,
        node_id: NodeId,
        text: &str,
        attributed: Option<crate::cg::types::AttributedString>,
    ) {
        use crate::painter::layer::{PainterPictureLayer, PainterRenderCommand};

        fn update_text_layer(
            tl: &mut crate::painter::layer::PainterPictureTextLayer,
            text: &str,
            attributed: &Option<crate::cg::types::AttributedString>,
        ) {
            tl.text = text.to_owned();
            if let Some(ref attr) = attributed {
                tl.attributed_string = Some(attr.clone());
            }
        }

        // Update text in the flat layer entries.
        for entry in &mut self.scene_cache.layers.layers {
            if let PainterPictureLayer::Text(ref mut tl) = entry.layer {
                if tl.base.id == node_id {
                    update_text_layer(tl, text, &attributed);
                    break;
                }
            }
        }

        // Update text in the render command tree (this is what the Painter
        // actually draws via draw_render_commands).
        fn update_commands(
            commands: &mut [PainterRenderCommand],
            node_id: NodeId,
            text: &str,
            attributed: &Option<crate::cg::types::AttributedString>,
        ) {
            for cmd in commands.iter_mut() {
                match cmd {
                    PainterRenderCommand::Draw(ref mut layer) => {
                        if let PainterPictureLayer::Text(ref mut tl) = layer {
                            if tl.base.id == node_id {
                                update_text_layer(tl, text, attributed);
                            }
                        }
                    }
                    PainterRenderCommand::MaskGroup(ref mut group) => {
                        update_commands(&mut group.mask_commands, node_id, text, attributed);
                        update_commands(&mut group.content_commands, node_id, text, attributed);
                    }
                    PainterRenderCommand::RenderSurface(ref mut surface) => {
                        if let Some(ref mut own_layer) = surface.own_layer {
                            if let PainterPictureLayer::Text(ref mut tl) = own_layer {
                                if tl.base.id == node_id {
                                    update_text_layer(tl, text, attributed);
                                }
                            }
                        }
                        update_commands(&mut surface.children, node_id, text, attributed);
                    }
                }
            }
        }
        update_commands(
            &mut self.scene_cache.layers.commands,
            node_id,
            text,
            &attributed,
        );

        // Invalidate the paragraph cache for this node so the Painter
        // rebuilds the paragraph with the new text.
        self.scene_cache
            .paragraph
            .borrow_mut()
            .invalidate_by_id(node_id);

        // Invalidate the pan image cache so mouse-move frames don't blit
        // stale content while text is being edited.
        self.pan_image_cache = None;

        // Record the change. apply_changes() will handle per-node
        // picture/compositor/atlas invalidation and viewport caches.
        self.mark_node_changed(node_id, ChangeFlags::NODE_TEXT);
    }

    /// Update the shape bounding rect for a text node's layer.
    ///
    /// Called during text editing to keep the surface overlay (selection/hover
    /// outline) in sync with the paragraph's laid-out dimensions.
    pub fn update_layer_text_shape(&mut self, node_id: NodeId, width: f32, height: f32) {
        use crate::painter::layer::PainterPictureLayer;

        for entry in &mut self.scene_cache.layers.layers {
            if entry.id == node_id {
                if let PainterPictureLayer::Text(ref mut tl) = entry.layer {
                    let rect = skia_safe::Rect::from_xywh(0.0, 0.0, width, height);
                    tl.shape = crate::painter::geometry::PainterShape::from_rect(rect);
                }
                break;
            }
        }
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
    /// Returns image refs that were needed during render but not found,
    /// excluding refs already reported in a previous drain.
    pub fn drain_missing_images(&mut self) -> Vec<String> {
        self.images.drain_missing()
    }

    /// the setting is accepted but silently ignored at render time.
    pub fn set_layer_compositing(&mut self, enable: bool) {
        self.config.layer_compositing = enable;
        if !enable {
            self.scene_cache.compositor.clear();
            self.compositor_atlas.clear();
            self.mark_changed(ChangeFlags::CONFIG);
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
            self.mark_changed(ChangeFlags::CONFIG);
        }
    }

    /// Adjust the camera to fit the entire scene content in view with padding.
    pub fn fit_camera_to_scene(&mut self) {
        let Some(scene) = self.scene.as_ref() else {
            return;
        };
        let ids: Vec<_> = scene.graph.roots().to_vec();
        self.fit_camera_to_nodes(&ids);
    }

    /// Adjust the camera to fit the given nodes in view with padding.
    pub fn fit_camera_to_nodes(&mut self, ids: &[NodeId]) {
        let geometry = self.scene_cache.geometry();
        let mut union: Option<rect::Rectangle> = None;
        for id in ids {
            if let Some(bounds) = geometry.get_world_bounds(id) {
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

    /// Enable or disable layout computation during `load_scene`.
    ///
    /// When `skip` is true, `load_scene` bypasses the Taffy flexbox engine
    /// and derives layout results directly from each node's schema position
    /// and size. This is appropriate for documents with only absolute
    /// positioning (e.g. imported Figma files without auto-layout).
    ///
    /// This flag must be set **before** calling `load_scene` / `switch_scene`.
    pub fn set_skip_layout(&mut self, skip: bool) {
        self.config.skip_layout = skip;
    }

    /// Render the queued frame if any and return the completed statistics.
    /// Intended to be called by the host when a redraw request is received.
    ///
    /// NOTE: camera `consume_change()` is NOT called here. The caller
    /// (`app.redraw()` or `app.frame()`) is responsible for consuming
    /// after rendering. Consuming here would eat the change before
    /// `frame()` sees it on the web path, where both `redraw()` (called
    /// by JS) and `frame()` (called by RAF) may run.
    pub fn flush(&mut self) -> FrameFlushResult {
        if !self.fc.has_pending() {
            return FrameFlushResult::NoPending;
        }

        let Some(plan_state) = self.plan.take() else {
            return FrameFlushResult::NoFrame;
        };

        if self.scene.is_none() {
            return FrameFlushResult::NoScene;
        }

        let stats = self.render_frame_with_plan_state(plan_state);

        self.fc.flush();
        self.plan = None;

        FrameFlushResult::OK(stats)
    }

    /// Core rendering logic shared by `flush()` and `flush_with_plan()`.
    ///
    /// Assumes `self.scene` is `Some`. Panics otherwise.
    /// Render a frame, resolving a deferred plan only if cache misses.
    ///
    /// When the plan is `Deferred`, the expensive R-tree query and sort are
    /// skipped if a pan or zoom cache satisfies the frame. This saves
    /// ~400-500µs per frame on large scenes (136K+ nodes).
    fn render_frame_with_plan_state(&mut self, plan_state: PlanState) -> FrameFlushStats {
        let (stable, camera_change) = match &plan_state {
            PlanState::Ready(p) => (p.stable, p.camera_change),
            PlanState::Deferred(d) => (d.stable, d.camera_change),
        };

        let strategy = self.frame_strategy(stable, camera_change);

        let start = Instant::now();
        let scene_ptr = self.scene.as_ref().unwrap() as *const Scene;
        let surface = unsafe { &mut *self.backend.get_surface() };
        let scene = unsafe { &*scene_ptr };

        // --- Pan image cache: blit from ORIGINAL capture ---
        //
        // During pan-only frames with a cached composited frame, blit the
        // ORIGINAL cached texture at the cumulative offset from its capture
        // position. We do NOT recapture from the blitted result — that would
        // progressively degrade the image (each blit loses edge pixels to
        // background, and circular panning would erase all content).
        //
        // Instead, we keep the original full-quality capture and always blit
        // from it. At the same zoom level with all content visible (fit zoom),
        // this means panning NEVER needs a redraw — just different offsets
        // into the same cached snapshot.
        //
        // When the offset exceeds the viewport (no overlap with cached frame),
        // we fall through to a full redraw which captures a new snapshot.
        if strategy.use_image_caches && !camera_change.zoom_changed() {
            if let Some(ref cache) = self.pan_image_cache {
                let width = surface.width() as f32;
                let height = surface.height() as f32;
                let vm = self.camera.view_matrix();
                let dx = vm.matrix[0][2] - cache.origin_tx;
                let dy = vm.matrix[1][2] - cache.origin_ty;

                // Reject if offset is larger than the viewport (the entire
                // cached frame has scrolled off-screen — no overlap left).
                if dx.abs() < width && dy.abs() < height {
                    let canvas = surface.canvas();

                    // Clear with background + blit the ORIGINAL cached frame.
                    if let Some(bg) = scene.background_color {
                        canvas.clear(Color::from(bg));
                    } else {
                        canvas.clear(Color::TRANSPARENT);
                    }
                    canvas.draw_image(&cache.image, (dx, dy), None);

                    // GPU flush.
                    let mid_flush_start = Instant::now();
                    Self::gpu_flush(surface);
                    let mid_flush_duration = mid_flush_start.elapsed();
                    let frame_duration = start.elapsed();

                    // Do NOT recapture — keep the original. The settle frame
                    // will do a fresh full-quality draw and capture.

                    let plan = FramePlan {
                        stable,
                        camera_change,
                        viewport: rect::Rectangle {
                            x: 0.0,
                            y: 0.0,
                            width: 0.0,
                            height: 0.0,
                        },
                        promoted: Vec::new(),
                        regions: Vec::new(),
                        compositor_indices: Vec::new(),
                        display_list_duration: Duration::ZERO,
                        display_list_size_estimated: 0,
                        predicted_cost_us: 0.0,
                    };

                    return FrameFlushStats {
                        frame: plan,
                        draw: DrawResult {
                            painter_duration: Duration::ZERO,
                            cache_picture_used: 0,
                            cache_picture_size: self.scene_cache.picture.len(),
                            cache_geometry_size: self.scene_cache.geometry.len(),
                            layer_image_cache_size: 0,
                            layer_image_cache_hits: 0,
                            layer_image_cache_bytes: 0,
                            live_draw_count: 0,
                        },
                        frame_duration,
                        flush_duration: Duration::ZERO,
                        total_duration: frame_duration,
                        compositor_duration: Duration::ZERO,
                        mid_flush_duration,
                    };
                }
                // Offset >= viewport — entire frame scrolled off.
                // Fall through to full redraw (cache stays for potential reuse
                // if user pans back).
            }
        }

        // --- Try zoom image cache fast path (no plan needed) ---
        //
        // Use the zoom cache for:
        // - Zoom-change frames (the primary use case during active zooming)
        // - No-change frames when a zoom cache exists (zoom steps may
        //   quantize to identical values at gesture bounds, producing a
        //   no-change frame — blitting the existing cache is correct and
        //   avoids a catastrophic full draw on large scenes)
        //
        // Exclude pan-only frames — pan has its own faster blit cache.
        let use_zoom_cache = strategy.use_image_caches
            && self.zoom_image_cache.is_some()
            && (camera_change.zoom_changed() || camera_change == CameraChangeKind::None);
        if use_zoom_cache {
            let zoom_cache_hit = self.try_zoom_cache_blit(
                surface,
                scene,
                &FramePlan {
                    stable,
                    camera_change,
                    viewport: rect::Rectangle {
                        x: 0.0,
                        y: 0.0,
                        width: 0.0,
                        height: 0.0,
                    },
                    promoted: Vec::new(),
                    regions: Vec::new(),
                    compositor_indices: Vec::new(),
                    display_list_duration: Duration::ZERO,
                    display_list_size_estimated: 0,
                    predicted_cost_us: 0.0,
                },
            );
            if let Some((mid_flush_duration, frame_duration)) = zoom_cache_hit {
                let plan = FramePlan {
                    stable,
                    camera_change,
                    viewport: rect::Rectangle {
                        x: 0.0,
                        y: 0.0,
                        width: 0.0,
                        height: 0.0,
                    },
                    promoted: Vec::new(),
                    regions: Vec::new(),
                    compositor_indices: Vec::new(),
                    display_list_duration: Duration::ZERO,
                    display_list_size_estimated: 0,
                    predicted_cost_us: 0.0,
                };
                return FrameFlushStats {
                    frame: plan,
                    draw: DrawResult {
                        painter_duration: Duration::ZERO,
                        cache_picture_used: 0,
                        cache_picture_size: self.scene_cache.picture.len(),
                        cache_geometry_size: self.scene_cache.geometry.len(),
                        layer_image_cache_size: 0,
                        layer_image_cache_hits: 0,
                        layer_image_cache_bytes: 0,
                        live_draw_count: 0,
                    },
                    frame_duration,
                    flush_duration: Duration::ZERO,
                    total_duration: frame_duration,
                    compositor_duration: Duration::ZERO,
                    mid_flush_duration,
                };
            }
        }

        // Cache miss — materialize the full plan (R-tree query + sort).
        let plan = match plan_state {
            PlanState::Ready(plan) => plan,
            PlanState::Deferred(deferred) => self.frame(
                deferred.bounds,
                deferred.zoom,
                deferred.stable,
                deferred.camera_change,
            ),
        };

        self.render_frame(plan, strategy)
    }

    fn render_frame(&mut self, plan: FramePlan, strategy: FrameRenderStrategy) -> FrameFlushStats {
        let start = Instant::now();

        let scene_ptr = self.scene.as_ref().unwrap() as *const Scene;
        let surface = unsafe { &mut *self.backend.get_surface() };
        let scene = unsafe { &*scene_ptr };

        let width = surface.width() as f32;
        let height = surface.height() as f32;

        // --- Pan image cache fast path ---
        // On pan-only frames with a valid cached composited frame and small
        // offset, blit the cached GPU texture instead of re-drawing all
        // nodes. This replaces O(N) draw commands + GPU rasterization with
        // a single texture blit.
        if strategy.use_image_caches && plan.camera_change == CameraChangeKind::PanOnly {
            if let Some(ref cache) = self.pan_image_cache {
                let vm = self.camera.view_matrix();
                let dx = vm.matrix[0][2] - cache.origin_tx;
                let dy = vm.matrix[1][2] - cache.origin_ty;

                if dx.abs() < width && dy.abs() < height {
                    let canvas = surface.canvas();
                    if let Some(bg) = scene.background_color {
                        canvas.clear(Color::from(bg));
                    } else {
                        canvas.clear(Color::TRANSPARENT);
                    }
                    canvas.draw_image(&cache.image, (dx, dy), None);

                    let mid_flush_start = Instant::now();
                    Self::gpu_flush(surface);
                    let mid_flush_duration = mid_flush_start.elapsed();

                    // Do NOT recapture — keep the original capture intact.

                    let frame_duration = start.elapsed();

                    return FrameFlushStats {
                        frame: plan,
                        draw: DrawResult {
                            painter_duration: Duration::ZERO,
                            cache_picture_used: 0,
                            cache_picture_size: self.scene_cache.picture.len(),
                            cache_geometry_size: self.scene_cache.geometry.len(),
                            layer_image_cache_size: 0,
                            layer_image_cache_hits: 0,
                            layer_image_cache_bytes: 0,
                            live_draw_count: 0,
                        },
                        frame_duration,
                        flush_duration: Duration::ZERO,
                        total_duration: frame_duration,
                        compositor_duration: Duration::ZERO,
                        mid_flush_duration,
                    };
                }
                // Offset >= viewport — fall through to full re-draw.
            }
        }

        // --- Zoom image cache fast path ---
        // On unstable frames with a valid zoom cache, scale the cached frame
        // texture instead of re-drawing all nodes. This replaces O(N) draw +
        // GPU rasterization with a single scaled texture blit.
        //
        // Triggers on:
        // - Zoom-change frames (the primary use case during active zooming)
        // - No-change frames when a zoom cache exists (zoom steps may
        //   quantize to identical values at gesture bounds, but we still
        //   have a valid cache — blitting it avoids catastrophic full draws)
        //
        // Excludes pan-only frames — those use the dedicated pan cache.
        let zoom_cache_usable = strategy.use_image_caches
            && self.zoom_image_cache.is_some()
            && (plan.camera_change.zoom_changed() || plan.camera_change == CameraChangeKind::None);
        if zoom_cache_usable {
            let zoom_cache_hit = self.try_zoom_cache_blit(surface, scene, &plan);
            if let Some((mid_flush_duration, frame_duration)) = zoom_cache_hit {
                return FrameFlushStats {
                    frame: plan,
                    draw: DrawResult {
                        painter_duration: Duration::ZERO,
                        cache_picture_used: 0,
                        cache_picture_size: self.scene_cache.picture.len(),
                        cache_geometry_size: self.scene_cache.geometry.len(),
                        layer_image_cache_size: 0,
                        layer_image_cache_hits: 0,
                        layer_image_cache_bytes: 0,
                        live_draw_count: 0,
                    },
                    frame_duration,
                    flush_duration: Duration::ZERO,
                    total_duration: frame_duration,
                    compositor_duration: Duration::ZERO,
                    mid_flush_duration,
                };
            }
        }

        // --- Full draw path ---

        // Reuse or create a downscaled offscreen for interaction rendering.
        let interaction_scale = self.config.interaction_render_scale;
        let use_downscale = !plan.stable && interaction_scale > 0.0 && interaction_scale < 1.0;
        if use_downscale {
            let sw = (width * interaction_scale).ceil() as i32;
            let sh = (height * interaction_scale).ceil() as i32;
            if sw > 0 && sh > 0 && (sw, sh) != self.downscale_dims {
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
            &plan,
            scene.background_color,
            width,
            height,
            ds_taken.as_mut(),
        );

        // Put it back for reuse next frame.
        if ds_taken.is_some() {
            self.downscale_surface = ds_taken;
        }

        // Mid-frame GPU flush: isolate draw vs compositor GPU work.
        let mid_flush_start = Instant::now();
        Self::gpu_flush(surface);
        let mid_flush_duration = mid_flush_start.elapsed();

        // Capture composited frame for image caches.
        // After mid_flush the surface has the complete rendered scene.
        // Always capture — even on stable frames — so that the NEXT
        // unstable frame can use the cache. Without this, stable frames
        // clear the cache (in queue()) but don't recapture, causing
        // the next unstable frame to do another expensive full draw.
        //
        // Single snapshot: both caches need the same image on non-zoom
        // frames. image_snapshot() is copy-on-write but still allocates
        // a handle — sharing avoids the second allocation.
        //
        // Skipped when strategy says caches won't be consulted (e.g.
        // eager-render at high zoom) — saves GPU readback overhead.
        if strategy.capture_image_caches {
            let vm = self.camera.view_matrix();
            let image = surface.image_snapshot();

            // Pan image cache: only useful when zoom is constant.
            if !plan.camera_change.zoom_changed() {
                self.pan_image_cache = Some(PanImageCache {
                    image: image.clone(),
                    origin_tx: vm.matrix[0][2],
                    origin_ty: vm.matrix[1][2],
                });
            }

            // Zoom image cache: capture after every full draw so that
            // the next zoom frame can use a scaled blit instead of
            // re-drawing.
            self.zoom_image_cache = Some(ZoomImageCache {
                image,
                view_matrix: vm,
            });
        }

        // Compositor update (GPU-only).
        let compositor_start = Instant::now();
        if strategy.use_compositor {
            if plan.stable {
                self.update_compositor_stable(surface, &plan.compositor_indices);
            } else {
                self.update_compositor(surface, &plan.compositor_indices);
            }
        }
        let compositor_duration = compositor_start.elapsed();

        let frame_duration = start.elapsed();

        // Final GPU flush.
        let flush_start = Instant::now();
        Self::gpu_flush(surface);
        let flush_duration = flush_start.elapsed();

        FrameFlushStats {
            frame: plan,
            draw,
            frame_duration,
            flush_duration,
            total_duration: frame_duration + flush_duration,
            compositor_duration,
            mid_flush_duration,
        }
    }

    /// Try to blit the zoom image cache. Returns `Some((mid_flush_duration, frame_duration))`
    /// on cache hit, `None` on miss (caller should proceed with full draw).
    fn try_zoom_cache_blit(
        &mut self,
        surface: &mut Surface,
        scene: &Scene,
        _plan: &FramePlan,
    ) -> Option<(Duration, Duration)> {
        let cache = self.zoom_image_cache.as_ref()?;

        // Never evict the zoom cache during active interaction — even at
        // extreme ratios the scaled blit is O(1) and avoids catastrophic
        // frame spikes (50-60 ms full draws on large scenes).  The settle
        // frame always produces a full-quality render at the correct zoom.
        //
        // At ratios beyond ZOOM_IMAGE_CACHE_SOFT_RATIO the stretched
        // texture is visibly blurry, but this is acceptable during fast
        // interaction.  Chromium's compositor uses the same strategy:
        // stale tiles are stretched during pinch-zoom and re-rasterized
        // asynchronously after the gesture ends.

        let inv_cached = cache.view_matrix.inverse()?;
        let cur_vm = self.camera.view_matrix();

        // residual = current_view × inverse(cached_view)
        let residual = cur_vm.compose(&inv_cached);

        let start = Instant::now();
        let canvas = surface.canvas();
        if let Some(bg) = scene.background_color {
            canvas.clear(Color::from(bg));
        } else {
            canvas.clear(Color::TRANSPARENT);
        }

        canvas.save();
        canvas.concat(&sk::sk_matrix(residual.matrix));

        let sampling = skia_safe::SamplingOptions::new(
            skia_safe::FilterMode::Linear,
            skia_safe::MipmapMode::None,
        );
        let mut paint = SkPaint::default();
        paint.set_anti_alias(false);
        canvas.draw_image_with_sampling_options(&cache.image, (0.0, 0.0), sampling, Some(&paint));
        canvas.restore();

        let mid_flush_start = Instant::now();
        Self::gpu_flush(surface);
        let mid_flush_duration = mid_flush_start.elapsed();
        let frame_duration = start.elapsed();

        Some((mid_flush_duration, frame_duration))
    }

    #[inline]
    fn gpu_flush(surface: &mut Surface) {
        if let Some(mut gr_context) = surface.recording_context() {
            if let Some(mut direct_context) = gr_context.as_direct_context() {
                direct_context.flush_and_submit();
            }
        }
    }

    /// Submit any pending overlay draws to the GPU.
    ///
    /// Call this after drawing overlays on [`Self::canvas()`] to make the
    /// additional pixels visible. This is the same GPU submit that
    /// `Application::draw_and_flush_devtools_overlay` performs after painting
    /// selection outlines, frame title badges, and the size meter.
    pub fn flush_overlay(&mut self) {
        let surface = unsafe { &mut *self.backend.get_surface() };
        Self::gpu_flush(surface);
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
        #[cfg(feature = "perf")]
        let _t0 = crate::sys::perf_now();

        self.scene = Some(scene);

        self.scene_cache = cache::scene::SceneCache::new();
        self.pan_image_cache = None;
        self.zoom_image_cache = None;
        self.last_prefill_generation = u64::MAX;
        self.last_prefill_variant_key = u64::MAX;
        self.last_prefill_layer_count = 0;
        self.images.clear_missing_tracking();
        if let Some(scene) = self.scene.as_ref() {
            #[cfg(feature = "perf")]
            let _t_fonts_start = crate::sys::perf_now();
            let requested = collect_scene_font_families(scene);
            self.fonts.set_requested_families(requested.into_iter());
            #[cfg(feature = "perf")]
            let _t_fonts = crate::sys::perf_now();

            let viewport_size = self.window_context.viewport_size;

            // 1. Compute layout phase
            //
            // NOTE: We cannot auto-skip Taffy based on has_flex() alone because
            // compute_schema_only() skips text measurement — text nodes with
            // height=None would get height=0 and become invisible. A future
            // optimization could use a hybrid path that skips flex computation
            // but still measures text via the paragraph cache.
            if self.config.skip_layout {
                // Fast path: derive layout directly from schema positions/sizes.
                // Skips Taffy tree construction, flexbox computation, and text
                // measurement — O(n) with minimal per-node work.
                self.layout_engine.compute_schema_only(scene);
            } else {
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
            #[cfg(feature = "perf")]
            let _t_layout = crate::sys::perf_now();

            // 2. Build geometry with layout results
            let layout_result = self.layout_engine.result();
            self.scene_cache.update_geometry_with_layout(
                scene,
                &self.fonts,
                layout_result,
                viewport_size,
            );
            #[cfg(feature = "perf")]
            let _t_geometry = crate::sys::perf_now();

            // 3. Build effect tree (identifies render surface boundaries)
            self.scene_cache.update_effect_tree(scene);
            #[cfg(feature = "perf")]
            let _t_effects = crate::sys::perf_now();

            // 4. Build layers
            self.scene_cache.update_layers(scene);

            #[cfg(feature = "perf")]
            {
                let _t_layers = crate::sys::perf_now();
                eprintln!(
                    "[load_scene] fonts={:.0}ms layout={:.0}ms geometry={:.0}ms effects={:.0}ms layers={:.0}ms total={:.0}ms",
                    _t_fonts - _t_fonts_start,
                    _t_layout - _t_fonts,
                    _t_geometry - _t_layout,
                    _t_effects - _t_geometry,
                    _t_layers - _t_effects,
                    _t_layers - _t0,
                );
            }
        }
        // Record SCENE_LOAD so apply_changes() knows to clear picture/paragraph/
        // path/compositor caches on the next frame. The scene_cache was already
        // replaced above (empty), so the caches are naturally fresh — but the
        // flag is still needed for viewport snapshot caches and any future
        // apply_changes() logic.
        self.mark_changed(ChangeFlags::SCENE_LOAD);
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

        // Invalidate pan image cache on zoom changes only.
        // Zoom changes alter the pixel content (different scale/density).
        // Stable frames do NOT nuke the pan cache — the cache is valid for
        // pan-only and no-change scenarios. The render path recaptures it
        // from the full-quality draw anyway, so the next unstable frame
        // always has a fresh cache to blit from.
        if camera_change.zoom_changed() {
            self.pan_image_cache = None;
        }

        // Invalidate zoom image cache on stable frames (always full-quality).
        // Keep it alive across all unstable changes — zoom changes use it for
        // scaled blit, pan-only changes let it persist for when zoom resumes,
        // and no-change frames can blit it as-is.
        if stable {
            self.zoom_image_cache = None;
        }

        // Build the frame plan. On unstable frames where a cache (pan or zoom)
        // is likely to satisfy the frame, defer the expensive R-tree query and
        // sort to flush() — they'll be skipped entirely on cache hits.
        let bounds = self.camera.rect();
        let zoom = self.camera.get_zoom();

        let strategy = self.frame_strategy(stable, camera_change);

        if strategy.can_defer_plan {
            self.plan = Some(PlanState::Deferred(DeferredPlan {
                bounds,
                zoom,
                stable,
                camera_change,
            }));
        } else {
            self.plan = Some(PlanState::Ready(self.frame(
                bounds,
                zoom,
                stable,
                camera_change,
            )));
        }

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

    /// Mark compositor entries as stale on zoom change.
    ///
    /// Called by the application's `frame()` method when the camera zoom
    /// changed. Separated from `queue()` so that the new `FrameLoop`-based
    /// path can prepare the renderer without building a full plan eagerly.
    pub fn invalidate_compositor_on_zoom(&mut self) {
        if self.config.layer_compositing {
            self.scene_cache.compositor.mark_all_stale();
        }
    }

    /// Build a frame plan without queuing it on the renderer.
    ///
    /// Used by the application's unified `frame()` entry point, which
    /// handles frame scheduling through `FrameLoop` rather than the
    /// legacy `FrameCounter`-based path.
    pub fn build_frame_plan(
        &self,
        bounds: rect::Rectangle,
        zoom: f32,
        stable: bool,
        camera_change: CameraChangeKind,
    ) -> FramePlan {
        self.frame(bounds, zoom, stable, camera_change)
    }

    /// Flush a caller-provided plan: draw + GPU submit + compositor update.
    ///
    /// Returns `Some(stats)` on success, `None` if no scene is loaded.
    /// Unlike the legacy `flush()`, this does NOT consult `FrameCounter`
    /// — the caller (via `FrameLoop`) already decided to render.
    pub fn flush_with_plan(&mut self, plan: FramePlan) -> Option<FrameFlushStats> {
        if self.scene.is_none() {
            return None;
        }
        let strategy = self.frame_strategy(plan.stable, plan.camera_change);
        Some(self.render_frame(plan, strategy))
    }

    /// Restore cached content for overlay-only frames.
    ///
    /// Blits the pan image cache at (0,0) onto the backend surface,
    /// restoring the content layer without the previous overlay pixels.
    /// Returns `true` if the blit succeeded, `false` if no cache exists.
    ///
    /// Used when neither scene data nor the camera changed — the content
    /// is identical, so we skip the expensive frame-plan + draw and just
    /// repaint the overlay on top of cached content.
    pub fn blit_content_cache(&mut self) -> bool {
        if !self.backend.is_gpu() {
            return false;
        }
        let cache = match self.pan_image_cache.as_ref() {
            Some(c) => c,
            None => return false,
        };
        // The pan cache image was captured at (origin_tx, origin_ty).
        // If the camera has since moved (e.g. pan-only fast-path frames
        // that don't recapture), we must offset the blit — otherwise the
        // settle frame "reverts" to the old camera position.
        let vm = self.camera.view_matrix();
        let dx = vm.matrix[0][2] - cache.origin_tx;
        let dy = vm.matrix[1][2] - cache.origin_ty;

        let surface = unsafe { &mut *self.backend.get_surface() };
        let canvas = surface.canvas();
        if dx != 0.0 || dy != 0.0 {
            // Offset blit — need to clear first (exposed edges).
            if let Some(scene) = self.scene.as_ref() {
                if let Some(bg) = scene.background_color {
                    canvas.clear(skia_safe::Color::from(bg));
                } else {
                    canvas.clear(skia_safe::Color::TRANSPARENT);
                }
            } else {
                canvas.clear(skia_safe::Color::TRANSPARENT);
            }
        }
        canvas.draw_image(&cache.image, (dx, dy), None);
        Self::gpu_flush(surface);
        true
    }

    /// Clear the cached scene picture.
    ///
    /// **Prefer [`mark_changed`] + [`apply_changes`]** for new code.
    /// This method is retained for the few call sites that have not yet
    /// been migrated to the central change-tracking system.
    pub fn invalidate_cache(&mut self) {
        self.scene_cache.invalidate();
        // Also invalidate all compositor layer images so they re-rasterize.
        self.scene_cache.compositor.invalidate_all();
        self.compositor_atlas.clear();
        self.pan_image_cache = None;
        self.zoom_image_cache = None;
    }

    // -------------------------------------------------------------------
    // Central change-tracking
    // -------------------------------------------------------------------

    /// Declare that something changed.
    ///
    /// Callers set the appropriate [`ChangeFlags`] to describe the
    /// mutation. The renderer accumulates them until the next frame,
    /// when [`apply_changes`] translates the flags into precise
    /// per-cache invalidation.
    pub fn mark_changed(&mut self, flags: ChangeFlags) {
        self.changes.mark(flags);
    }

    /// Declare that a specific node changed.
    ///
    /// Same as [`mark_changed`] but also records the node ID for
    /// surgical per-node cache invalidation.
    pub fn mark_node_changed(&mut self, id: NodeId, flags: ChangeFlags) {
        self.changes.push_node(id, flags);
    }

    /// Consume accumulated changes and perform cache invalidation.
    ///
    /// Called once per frame (at the start of `Application::frame()`)
    /// before building the frame plan.  This is the **single source of
    /// truth** for which caches are invalidated by which mutations.
    ///
    /// The `camera_change` parameter is folded in so that zoom/pan
    /// invalidation lives in the same dispatch table.
    /// Returns `true` when content actually needs re-rendering (data or
    /// camera changed).  Returns `false` for overlay-only frames (e.g.
    /// marquee drag, hover highlight) where the caller can skip the
    /// expensive frame-plan + draw and just blit the cached content.
    pub fn apply_changes(&mut self, camera_change: CameraChangeKind, stable: bool) -> bool {
        let cs = self.changes.take();
        let flags = cs.flags();

        // Fast path: nothing changed (pure camera move handled below).
        let has_data_changes = !flags.is_empty();
        let content_changed = has_data_changes || camera_change.any_changed();

        // ----- Layout -----
        // Scene load handles its own layout in load_scene(); skip here.
        // Viewport resize needs layout only when the scene has ICB nodes
        // or auto-sized roots (the common infinite-canvas case has neither).
        // Invalidate paragraph cache before layout so rebuild_scene_caches()
        // measures text with the new fonts rather than stale fallback paragraphs.
        if flags.contains(ChangeFlags::FONT_LOADED) {
            self.scene_cache.paragraph.borrow_mut().invalidate();
        }

        if has_data_changes && !flags.contains(ChangeFlags::SCENE_LOAD) {
            let needs_layout = flags
                .intersects(ChangeFlags::LAYOUT_DIRTY | ChangeFlags::FONT_LOADED)
                || (flags.contains(ChangeFlags::VIEWPORT_SIZE)
                    && self.scene_has_viewport_dependent_layout());
            if needs_layout {
                self.rebuild_scene_caches();
            }
        }

        // ----- Picture cache (per-node recorded Skia Pictures) -----
        if flags.intersects(
            ChangeFlags::SCENE_LOAD | ChangeFlags::FONT_LOADED | ChangeFlags::IMAGE_LOADED,
        ) {
            self.scene_cache.picture.invalidate();
        } else if has_data_changes {
            for &id in cs.nodes() {
                self.scene_cache.picture.invalidate_node(id);
            }
        }

        // ----- Paragraph cache (text layout) -----
        // FONT_LOADED is handled above (before rebuild_scene_caches) so that
        // layout measurement uses fresh paragraphs. Only SCENE_LOAD needs
        // invalidation here.
        if flags.contains(ChangeFlags::SCENE_LOAD) {
            self.scene_cache.paragraph.borrow_mut().invalidate();
        }
        // Per-node paragraph invalidation is handled by update_layer_text
        // which runs before mark_changed, so we don't repeat it here.

        // ----- Vector path cache -----
        if flags.contains(ChangeFlags::SCENE_LOAD) {
            self.scene_cache.path.borrow_mut().invalidate();
        }

        // ----- Compositor (LayerImageCache) + Atlas -----
        if flags.contains(ChangeFlags::SCENE_LOAD) {
            self.scene_cache.compositor.clear();
            self.compositor_atlas.clear();
        } else if flags.intersects(ChangeFlags::FONT_LOADED | ChangeFlags::IMAGE_LOADED) {
            self.scene_cache.compositor.invalidate_all();
            self.compositor_atlas.clear();
        } else if flags.contains(ChangeFlags::CONFIG) {
            // Config changes (e.g. atlas toggle off) may need full compositor reset.
            // The config-change call site sets compositor state directly before
            // marking CONFIG; this handles the residual viewport cache clearing.
        }
        // Zoom-triggered compositor staleness
        if camera_change.zoom_changed() && self.config.layer_compositing {
            self.scene_cache.compositor.mark_all_stale();
        }
        // Per-node compositor invalidation
        for &id in cs.nodes() {
            self.scene_cache.compositor.invalidate(&id);
            self.compositor_atlas.free_node(&id);
        }

        // ----- Viewport snapshot caches (pan/zoom image caches) -----
        // These are the ONLY caches that truly depend on viewport dimensions.
        //
        // Pan cache: invalidate on data changes or zoom changes.  Stable
        // frames do NOT nuke the pan cache — during slow panning, a stable
        // frame firing between scroll events would destroy the cache and
        // force an expensive full redraw on the next unstable frame.  The
        // stable frame's render path recaptures the pan cache anyway.
        let invalidate_pan = has_data_changes || camera_change.zoom_changed();
        // Zoom cache: invalidate when content changed OR when a stable frame
        // follows a camera change (full-quality recapture needed).  Overlay-
        // only frames (no data + no camera change) must NOT nuke the zoom
        // cache — the content is identical, and destroying the cache forces
        // an expensive full draw on the next real zoom interaction.
        let invalidate_zoom = has_data_changes || (stable && camera_change.any_changed());

        if invalidate_pan {
            self.pan_image_cache = None;
        }
        if invalidate_zoom {
            self.zoom_image_cache = None;
        }

        content_changed
    }

    /// Check whether the current scene has layout that depends on viewport size.
    ///
    /// Returns `true` if any root node is an `InitialContainer` (ICB) — the
    /// only node type whose Taffy style size is derived from viewport dimensions.
    ///
    /// When this returns `false`, `rebuild_scene_caches()` produces identical
    /// output regardless of viewport size, so it can be skipped on resize.
    fn scene_has_viewport_dependent_layout(&self) -> bool {
        if self.config.skip_layout {
            // compute_schema_only doesn't use viewport_size at all.
            return false;
        }
        let Some(scene) = self.scene.as_ref() else {
            return false;
        };
        for &root_id in scene.graph.roots() {
            if let Ok(node) = scene.graph.get_node(&root_id) {
                if matches!(node, Node::InitialContainer(_)) {
                    return true;
                }
            }
        }
        false
    }

    /// Rebuild scene caches after scene geometry has changed.
    /// Call this after modifying node sizes, positions, or other geometry properties.
    pub fn rebuild_scene_caches(&mut self) {
        if let Some(scene) = self.scene.as_ref() {
            let viewport_size = self.window_context.viewport_size;

            // 1. Recompute layout
            if self.config.skip_layout {
                self.layout_engine.compute_schema_only(scene);
            } else {
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
        // Skia's built-in mipmaps evaluate LOD at rasterization time based on
        // the final canvas transform, so Picture playback at different zoom
        // levels automatically selects the correct mipmap level.
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
        self.with_recording_cached_with_policy(id, variant_key, self.config.render_policy, draw)
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

    // ── Render cost prediction ─────────────────────────────────────
    // Read-only debug metric. Delegates to `runtime::cost_prediction`.
    // See docs/wg/feat-2d/render-cost-prediction.md for derivation.

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

        let effective_layer_compositing =
            self.config.layer_compositing && self.config.render_policy.allows_layer_compositing();

        let mut promoted_ids: Vec<NodeId> = Vec::new();
        let mut regions: Vec<(rect::Rectangle, Vec<usize>)> = Vec::new();

        // Full-viewport fast path: when the camera viewport fully contains
        // the scene envelope (R-tree root AABB), ALL indexed layers are
        // visible. Skip the R-tree traversal + sort entirely and return
        // 0..n. This is O(1) vs O(n log n) — saves ~1600 us on 135K-node
        // scenes at fit zoom (the common view-only case).
        //
        // Safety: only valid when every layer has render bounds (i.e. the
        // R-tree indexes all layers). update_layers() uses filter_map to
        // skip layers without render bounds, so layer_count can exceed
        // the R-tree size. We guard against this by requiring the counts
        // match — when they don't, the R-tree query correctly excludes
        // the bounds-less layers.
        let layer_count = self.scene_cache.layers.layers.len();
        let rtree_size = self.scene_cache.layer_index.size();
        let all_visible = layer_count == rtree_size
            && match self.scene_cache.scene_envelope() {
                None => true, // empty scene → trivially "all visible"
                Some(envelope) => {
                    let lower = envelope.lower();
                    let upper = envelope.upper();
                    bounds.x <= lower[0]
                        && bounds.y <= lower[1]
                        && bounds.x + bounds.width >= upper[0]
                        && bounds.y + bounds.height >= upper[1]
                }
            };

        let indices = if all_visible {
            // All layers visible — sequential indices, already sorted.
            (0..layer_count).collect::<Vec<_>>()
        } else {
            // Partial visibility — R-tree spatial query.
            let mut queried = self.scene_cache.intersects(bounds);
            // sort_unstable (pdqsort) is 2-3x faster than stable merge sort
            // for integer data because it avoids the O(n) merge buffer
            // allocation. Draw order correctness only requires sorted indices,
            // not stability.
            queried.sort_unstable();
            queried
        };

        // Pre-filter compositor-relevant indices during the same pass.
        // Nodes without expensive effects (the vast majority) are skipped
        // by the compositor anyway. Filtering here avoids a redundant
        // R-tree query in update_compositor_inner AND reduces the compositor
        // loop to only promotable nodes.
        let mut compositor_indices = Vec::new();

        if effective_layer_compositing {
            // Separate promoted (cached) nodes from live-drawn nodes.
            let mut live_indices = Vec::new();
            for &idx in &indices {
                if let Some(entry) = self.scene_cache.layers.layers.get(idx) {
                    if crate::cache::compositor::promotion::has_promotable_effects(&entry.layer) {
                        compositor_indices.push(idx);
                    }
                    if self.scene_cache.compositor.peek(&entry.id).is_some() {
                        promoted_ids.push(entry.id);
                    } else {
                        live_indices.push(idx);
                    }
                }
            }
            if !live_indices.is_empty() {
                regions.push((bounds, live_indices));
            }
        } else {
            // No compositing: still collect compositor-relevant indices
            // for the compositor update pass.
            for &idx in &indices {
                if let Some(entry) = self.scene_cache.layers.layers.get(idx) {
                    if crate::cache::compositor::promotion::has_promotable_effects(&entry.layer) {
                        compositor_indices.push(idx);
                    }
                }
            }
            regions.push((bounds, indices));
        }

        let ll_len = regions.iter().map(|(_, indices)| indices.len()).sum();

        // Predict frame cost: sum per-node fixed overhead costs.
        let predicted_cost_us = {
            let promoted_set: std::collections::HashSet<&NodeId> = promoted_ids.iter().collect();
            let mut total = 0.0_f64;
            // Live-drawn nodes (from regions)
            for (_, region_indices) in &regions {
                for &idx in region_indices {
                    if let Some(entry) = self.scene_cache.layers.layers.get(idx) {
                        total += crate::runtime::cost_prediction::estimate_node_cost(
                            &entry.layer,
                            false,
                        );
                    }
                }
            }
            // Promoted (cache-hit) nodes
            for &idx in &compositor_indices {
                if let Some(entry) = self.scene_cache.layers.layers.get(idx) {
                    if promoted_set.contains(&entry.id) {
                        total +=
                            crate::runtime::cost_prediction::estimate_node_cost(&entry.layer, true);
                    }
                }
            }
            total
        };

        let __ll_duration = __start.elapsed();

        FramePlan {
            stable,
            camera_change,
            viewport: bounds,
            promoted: promoted_ids,
            regions,
            compositor_indices,
            display_list_duration: __ll_duration,
            display_list_size_estimated: ll_len,
            predicted_cost_us,
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
                canvas,
                offscreen,
                plan,
                background_color,
                width,
                height,
                scaled_w,
                scaled_h,
                scale,
            );
            if let Some(r) = result {
                return r;
            }
            // Fallback: draw at full resolution below.
        }

        Self::clear_and_paint_background(canvas, background_color, width, height);

        canvas.save();

        // Apply camera transform
        canvas.concat(&sk::sk_matrix(self.camera.view_matrix().matrix));

        // Build promoted blit map: pre-extract image data for compositor-
        // cached nodes. The Painter will blit these inline at their correct
        // z-position in the render command tree, preserving proper z-order
        // when a live parent (e.g. Container with fills) has promoted children.
        let (promoted_blits, layer_image_cache_hits) = self.build_promoted_blits(plan);

        // Draw all layers via the Painter with promoted nodes blitted inline.
        let promoted_blits_ref = if promoted_blits.is_empty() {
            None
        } else {
            Some(&promoted_blits)
        };
        let cache_picture_used =
            self.draw_layers_with_scene_cache_skip(canvas, plan, promoted_blits_ref);

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

        // Build promoted blit map and draw all layers with inline blitting.
        let (promoted_blits, layer_image_cache_hits) = self.build_promoted_blits(plan);
        let promoted_blits_ref = if promoted_blits.is_empty() {
            None
        } else {
            Some(&promoted_blits)
        };
        let cache_picture_used =
            self.draw_layers_with_scene_cache_skip(off_canvas, plan, promoted_blits_ref);

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
    fn update_compositor(&mut self, parent_surface: &mut Surface, visible_indices: &[usize]) {
        self.update_compositor_inner(parent_surface, false, visible_indices);
    }

    /// Variant called on stable frames — no time budget, all stale entries
    /// are re-rasterized to achieve full quality at the final zoom.
    fn update_compositor_stable(
        &mut self,
        parent_surface: &mut Surface,
        visible_indices: &[usize],
    ) {
        self.update_compositor_inner(parent_surface, true, visible_indices);
    }

    /// Core compositor update logic.
    ///
    /// When `force_all` is true (stable frame), all stale/dirty entries are
    /// re-rasterized without a time budget. When false (unstable/interactive
    /// frame), re-rasterization is capped to `ZOOM_RERASTER_BUDGET` to keep
    /// frame times low.
    fn update_compositor_inner(
        &mut self,
        parent_surface: &mut Surface,
        force_all: bool,
        visible_indices: &[usize],
    ) {
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

        // Visible indices are pre-computed by the frame plan's R-tree query
        // and passed in to avoid a redundant spatial query each frame.

        // Time budget for stale re-rasterization during interactive frames.
        // 8ms leaves headroom within a 16ms frame budget (60fps target).
        const ZOOM_RERASTER_BUDGET: std::time::Duration = std::time::Duration::from_micros(8000);
        let budget_start = std::time::Instant::now();

        for &idx in visible_indices {
            let Some(entry) = self.scene_cache.layers.layers.get(idx) else {
                continue;
            };

            let id = entry.id;

            // Note: visible_indices is pre-filtered by the frame plan to only
            // include nodes with promotable effects (has_promotable_effects).
            // No need to re-check here.

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
                crate::painter::layer::PainterPictureLayer::Markdown(m) => &m.base,
                crate::painter::layer::PainterPictureLayer::HtmlEmbed(h) => &h.base,
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
                            let info =
                                skia_safe::ImageInfo::new_n32_premul((w as i32, h as i32), None);
                            self.compositor_surface
                                .as_mut()
                                .and_then(|cs| cs.new_surface(&info))
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
                            slot_canvas,
                            fonts,
                            images,
                            scene_cache,
                            policy,
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
                        id,
                        image,
                        zoom,
                        render_bounds,
                        node_opacity,
                        node_blend,
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
