use crate::cache::tile::{ImageTileCacheResolutionStrategy, RegionTileInfo};
use crate::cg::prelude::*;
use crate::node::{scene_graph::SceneGraph, schema::*};
use crate::painter::Painter;
use crate::runtime::counter::FrameCounter;
use crate::sk;
use crate::{
    cache,
    resources::{self, ByteStore, Resources},
    runtime::{
        camera::Camera2D, config::RuntimeRendererConfig, font_repository::FontRepository,
        image_repository::ImageRepository, system_images,
    },
};

use math2::{self, rect, region};
use skia_safe::{
    surfaces, Canvas, Image, Paint as SkPaint, Picture, PictureRecorder, Rect, Surface,
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

/// Type alias for tile information in frame planning
pub type FramePlanTileInfo = RegionTileInfo;

#[derive(Clone)]
pub struct FramePlan {
    pub stable: bool,
    /// cached tile keys with blur information
    pub tiles: Vec<FramePlanTileInfo>,
    /// regions with their intersecting indices
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
    pub tiles_total: usize,
    pub tiles_used: usize,
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
}

impl Renderer {
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

    pub fn canvas(&self) -> &Canvas {
        let surface = unsafe { &mut *self.backend.get_surface() };
        surface.canvas()
    }

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

    pub fn get_image_bytes(&self, id: &str) -> Option<Vec<u8>> {
        let rid = normalize_image_id(id);
        self.resources.get(&rid)
    }

    pub fn get_image_size(&self, id: &str) -> Option<(u32, u32)> {
        let rid = normalize_image_id(id);
        self.images.get_size(&rid)
    }

    /// Enable or disable the image tile cache.
    pub fn set_cache_tile(&mut self, enable: bool) {
        self.config.cache_tile = enable;
        if !enable {
            self.scene_cache.tile.clear_all();
        }
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
        let mut canvas = surface.canvas();
        let draw = self.draw(&mut canvas, &frame, scene.background_color, width, height);

        if self.config.cache_tile && frame.stable {
            // if !self.camera.has_zoom_changed() {}
            self.scene_cache.update_tiles(&self.camera, surface, true);
        }

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

            // 3. Build layers
            self.scene_cache.update_layers(scene);
        }
        self.queue_stable();
    }

    fn queue(&mut self, stable: bool) {
        // let deps_camera_changed = self.camera.changed();
        // TODO: check for dependencies

        // Always compute the latest frame plan so that a subsequent flush uses up-to-date state,
        // even if a previous frame is already pending.
        let rect = Some(self.camera.rect());
        self.plan = Some(self.frame(
            rect.unwrap_or(rect::Rectangle::empty()),
            self.camera.get_zoom(),
            stable,
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

            // 3. Rebuild layers
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

    fn with_recording(
        &self,
        bounds: &rect::Rectangle,
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
        let painter =
            Painter::new_with_scene_cache(canvas, &self.fonts, &self.images, &self.scene_cache);
        draw(&painter);
        recorder.finish_recording_as_picture(None)
    }

    fn with_recording_cached(
        &mut self,
        id: &NodeId,
        draw: impl FnOnce(&Painter),
    ) -> Option<Picture> {
        if let Some(pic) = self.scene_cache.picture.get_node_picture(id) {
            return Some(pic.clone());
        }

        let Some(bounds) = self.scene_cache.geometry.get_render_bounds(&id) else {
            return None;
        };
        let pic = self.with_recording(&bounds, draw);

        if let Some(pic) = &pic {
            self.scene_cache
                .picture
                .set_node_picture(id.clone(), pic.clone());
        }
        pic
    }

    /// Plan the frame for rendering.
    /// Arguments:
    /// - bounds: the bounding rect to be rendered (in world space)
    /// - zoom: the current zoom level
    fn frame(&self, bounds: rect::Rectangle, zoom: f32, stable: bool) -> FramePlan {
        let __start = Instant::now();

        let strategy = if stable {
            ImageTileCacheResolutionStrategy::Default
        } else {
            ImageTileCacheResolutionStrategy::ForceCache
        };

        let (visible_tiles, tile_rects) = if self.config.cache_tile {
            let region_tiles = self
                .scene_cache
                .tile
                .get_region_tiles(&bounds, zoom, strategy);
            (
                region_tiles.tiles().to_vec(),
                region_tiles.tile_rects().to_vec(),
            )
        } else {
            (Vec::new(), Vec::new())
        };

        let painter_region = if stable || !self.config.cache_tile {
            vec![bounds]
        } else {
            region::difference(bounds, &tile_rects)
        };

        let mut regions: Vec<(rect::Rectangle, Vec<usize>)> = Vec::new();

        for rect in painter_region {
            let mut indices = self.scene_cache.intersects(rect);

            // TODO: sort is expensive
            indices.sort();

            regions.push((rect, indices));
        }

        let ll_len = regions.iter().map(|(_, indices)| indices.len()).sum();

        let __ll_duration = __start.elapsed();

        FramePlan {
            stable: stable,
            tiles: visible_tiles,
            regions,
            // indices_should_paint: intersections.clone(),
            display_list_duration: __ll_duration,
            display_list_size_estimated: ll_len,
        }
    }

    /// Draw the scene to the canvas.
    /// - canvas: the canvas to render to
    /// - plan: the frame plan
    /// - width: the width of the canvas
    /// - height: the height of the canvas
    fn draw(
        &mut self,
        canvas: &Canvas,
        plan: &FramePlan,
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

        // Always draw via command pipeline. Tiles are drawn first (as a backdrop),
        // then the full command stream composes the final result.

        // draw image cache tiles
        for tk in plan.tiles.iter() {
            let tile_at_zoom = self.scene_cache.tile.get_tile(&tk.key);
            if let Some(tile_at_zoom) = tile_at_zoom {
                let image = &tile_at_zoom.image;
                let src = Rect::new(0.0, 0.0, image.width() as f32, image.height() as f32);
                let r = tk.rect;
                let dst = Rect::from_xywh(r.x, r.y, r.width, r.height);
                let mut paint = SkPaint::default();

                // Apply adaptive blur filter when the tile was captured at a lower zoom level
                // (lower resolution) than the current view
                if tk.blur && tk.blur_radius > 0.0 {
                    let blur_filter = skia_safe::image_filters::blur(
                        (tk.blur_radius, tk.blur_radius),
                        None,
                        None,
                        None,
                    );
                    paint.set_image_filter(blur_filter);
                }

                canvas.draw_image_rect(
                    image,
                    Some((&src, skia_safe::canvas::SrcRectConstraint::Fast)),
                    dst,
                    &paint,
                );
            }
        }

        // Prefill picture cache for visible layers so Painter can reuse pictures even with masks
        for (_region, indices) in &plan.regions {
            for idx in indices {
                if let Some(entry) = self.scene_cache.layers.layers.get(*idx).cloned() {
                    let id = entry.id;
                    let _ = self.with_recording_cached(&id, |painter| {
                        painter.draw_layer(&entry.layer);
                    });
                }
            }
        }

        let painter =
            Painter::new_with_scene_cache(canvas, &self.fonts, &self.images, &self.scene_cache);
        painter.draw_layer_list(&self.scene_cache.layers);
        let cache_picture_used = painter.cache_picture_hits();

        let __painter_duration = __before_paint.elapsed();

        canvas.restore();

        DrawResult {
            painter_duration: __painter_duration,
            cache_picture_used,
            cache_picture_size: self.scene_cache.picture.len(),
            cache_geometry_size: self.scene_cache.geometry.len(),
            tiles_total: self.scene_cache.tile.tiles().len(),
            tiles_used: plan.tiles.len(),
        }
        //
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

        // Always use the command pipeline for export to ensure masks are applied
        let painter =
            Painter::new_with_scene_cache(canvas, &self.fonts, &self.images, &self.scene_cache);
        painter.draw_layer_list(&self.scene_cache.layers);

        let __painter_duration = __before_paint.elapsed();

        canvas.restore();

        DrawResult {
            painter_duration: __painter_duration,
            cache_picture_used: 0,
            cache_picture_size: 0,
            cache_geometry_size: 0,
            tiles_total: 0,
            tiles_used: 0,
        }
        //
    }

    pub fn snapshot(&self) -> Image {
        let surface = unsafe { &mut *self.backend.get_surface() };

        let width = surface.width() as f32;
        let height = surface.height() as f32;
        let mut canvas = surface.canvas();
        let frame = self.frame(self.camera.rect(), 1.0, true);
        let _ = self.draw_nocache(&mut canvas, &frame, None, width, height);

        surface.image_snapshot()
    }

    /// Render the current scene onto the provided canvas. This is useful for
    /// exporting the scene using alternate backends such as PDF.
    pub fn render_to_canvas(&self, canvas: &Canvas, width: f32, height: f32) {
        let frame = self.frame(self.camera.rect(), 1.0, true);
        let background = self.scene.as_ref().and_then(|s| s.background_color);
        let _ = self.draw_nocache(canvas, &frame, background, width, height);
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
        renderer.queue_unstable();
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
        let pic = renderer.with_recording_cached(&9999, |_| {});
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
}
