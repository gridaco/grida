use crate::cache::tile::{ImageTileCacheResolutionStrategy, RegionTileInfo};
use crate::node::schema::*;
use crate::painter::layer::Layer;
use crate::painter::{cvt, Painter};
use crate::runtime::counter::FrameCounter;
use crate::{
    cache,
    runtime::camera::Camera2D,
    runtime::repository::{FontRepository, ImageRepository},
};

use math2::{self, rect, region};
use skia_safe::{
    surfaces, Canvas, Image, Paint as SkPaint, Picture, PictureRecorder, Rect, Surface,
};
use std::cell::RefCell;
use std::rc::Rc;
use std::sync::Arc;
use std::time::{Duration, Instant};

/// Callback type used to request a redraw from the host window.
pub type RequestRedrawCallback = Arc<dyn Fn()>;

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
}

/// ---------------------------------------------------------------------------
/// Renderer: manages backend, DPI, camera, and iterates over scene children
/// ---------------------------------------------------------------------------
pub struct Renderer {
    pub backend: Backend,
    scene: Option<Scene>,
    scene_cache: cache::scene::SceneCache,
    pub camera: Camera2D,
    pub images: Rc<RefCell<ImageRepository>>,
    pub fonts: Rc<RefCell<FontRepository>>,
    /// when called, the host will request a redraw in os-specific way
    request_redraw: RequestRedrawCallback,
    /// frame counter for managing render queue
    fc: FrameCounter,
    /// the frame plan for the next frame, to be drawn and flushed
    plan: Option<FramePlan>,
}

impl Renderer {
    pub fn new(backend: Backend, request_redraw: RequestRedrawCallback, camera: Camera2D) -> Self {
        let font_repository = FontRepository::new();
        let font_repository = Rc::new(RefCell::new(font_repository));
        let image_repository = ImageRepository::new();
        let image_repository = Rc::new(RefCell::new(image_repository));
        Self {
            backend,
            scene: None,
            camera,
            images: image_repository,
            fonts: font_repository,
            scene_cache: cache::scene::SceneCache::new(),
            request_redraw,
            fc: FrameCounter::new(),
            plan: None,
        }
    }

    /// Update the redraw callback used to notify the host when a new frame is
    /// ready.
    pub fn set_request_redraw(&mut self, cb: RequestRedrawCallback) {
        self.request_redraw = cb;
    }

    /// Access the cached scene data.
    pub fn get_cache(&self) -> &cache::scene::SceneCache {
        &self.scene_cache
    }

    pub fn init_raster(width: i32, height: i32) -> *mut Surface {
        let surface =
            surfaces::raster_n32_premul((width, height)).expect("Failed to create raster surface");
        Box::into_raw(Box::new(surface))
    }

    pub fn add_font(&mut self, family: &str, bytes: &[u8]) {
        self.fonts
            .borrow_mut()
            .insert(family.to_string(), bytes.to_vec());
    }

    /// Create an image from raw encoded bytes.
    pub fn add_image(&self, src: String, bytes: &[u8]) {
        let data = skia_safe::Data::new_copy(bytes);
        if let Some(image) = Image::from_encoded(data) {
            self.images.borrow_mut().insert(src, image);
        }
    }

    /// Render the queued frame if any and return the completed statistics.
    /// Intended to be called by the host when a redraw request is received.
    pub fn flush(&mut self) -> Option<FrameFlushStats> {
        if !self.fc.has_pending() {
            return None;
        }

        let Some(frame) = self.plan.take() else {
            return None;
        };

        let start = Instant::now();

        let Some(scene_ptr) = self.scene.as_ref().map(|s| s as *const Scene) else {
            return None;
        };

        let surface = unsafe { &mut *self.backend.get_surface() };
        let scene = unsafe { &*scene_ptr };

        let width = surface.width() as f32;
        let height = surface.height() as f32;
        let mut canvas = surface.canvas();
        let draw = self.draw(&mut canvas, &frame, scene.background_color, width, height);

        if frame.stable {
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

        Some(stats)
    }

    /// Invoke the request redraw callback.
    fn request_redraw(&self) {
        (self.request_redraw)();
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
        self.scene_cache = cache::scene::SceneCache::new();
        self.scene_cache.update_geometry(&scene);
        self.scene_cache.update_layers(&scene);
        self.scene = Some(scene);
        self.queue_stable();
    }

    fn queue(&mut self, stable: bool) {
        // let deps_camera_changed = self.camera.changed();
        // TODO: check for dependencies

        if !self.fc.has_pending() {
            let rect = Some(self.camera.rect());

            self.plan = Some(self.frame(
                rect.unwrap_or(rect::Rectangle::empty()),
                self.camera.get_zoom(),
                stable,
            ));

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
        let canvas = recorder.begin_recording(sk_bounds, None);
        let painter = Painter::new(canvas, self.fonts.clone(), self.images.clone());
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
    fn frame(&mut self, bounds: rect::Rectangle, zoom: f32, stable: bool) -> FramePlan {
        let __start = Instant::now();

        let strategy = if stable {
            ImageTileCacheResolutionStrategy::Default
        } else {
            ImageTileCacheResolutionStrategy::ForceCache
        };

        // Get tiles for the region with blur information and sorting
        let region_tiles = self
            .scene_cache
            .tile
            .get_region_tiles(&bounds, zoom, strategy);

        let visible_tiles: Vec<FramePlanTileInfo> = region_tiles.tiles().to_vec();
        let tile_rects: Vec<_> = region_tiles.tile_rects().to_vec();

        let painter_region = if stable {
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
        background_color: Option<Color>,
        width: f32,
        height: f32,
    ) -> DrawResult {
        let __before_paint = Instant::now();
        let mut cache_picture_used = 0;

        canvas.clear(skia_safe::Color::TRANSPARENT);

        // Paint background color first if present
        if let Some(bg_color) = background_color {
            let Color(r, g, b, a) = bg_color;
            let color = skia_safe::Color::from_argb(a, r, g, b);
            let mut paint = SkPaint::default();
            paint.set_color(color);
            // Paint the entire canvas with the background color
            canvas.draw_rect(Rect::new(0.0, 0.0, width, height), &paint);
        }

        canvas.save();

        // Apply camera transform
        canvas.concat(&cvt::sk_matrix(self.camera.view_matrix().matrix));

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

        // draw picture regions
        for (region, indices) in &plan.regions {
            for idx in indices {
                if let Some(layer) = self.scene_cache.layers.layers.get(*idx) {
                    let layer = layer.clone();
                    let picture = self.with_recording_cached(&layer.id(), |painter| {
                        painter.draw_layer(&layer);
                    });

                    if let Some(pic) = picture {
                        // clip to region
                        canvas.save();
                        canvas.clip_rect(
                            Rect::from_xywh(region.x, region.y, region.width, region.height),
                            None,
                            false,
                        );
                        canvas.draw_picture(pic, None, None);
                        canvas.restore();
                        cache_picture_used += 1;
                    }
                } else {
                    // report error
                    println!("layer not found: {}", idx);
                }
            }
        }

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
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::node::{factory::NodeFactory, repository::NodeRepository, schema::Size};
    use math2::transform::AffineTransform;

    #[test]
    fn picture_recorded_with_layer_bounds() {
        let nf = NodeFactory::new();
        let mut repo = NodeRepository::new();

        let mut rect = nf.create_rectangle_node();
        rect.size = Size {
            width: 50.0,
            height: 40.0,
        };
        let rect_id = rect.base.id.clone();
        repo.insert(Node::Rectangle(rect));

        let scene = Scene {
            id: "scene".into(),
            name: "test".into(),
            transform: AffineTransform::identity(),
            children: vec![rect_id.clone()],
            nodes: repo,
            background_color: None,
        };

        let surface_ptr = Renderer::init_raster(100, 100);
        let mut renderer = Renderer::new(
            Backend::Raster(surface_ptr),
            std::sync::Arc::new(|| {}),
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
        let surface_ptr = Renderer::init_raster(50, 50);
        let mut renderer = Renderer::new(
            Backend::Raster(surface_ptr),
            std::sync::Arc::new(|| {}),
            Camera2D::new(Size {
                width: 50.0,
                height: 50.0,
            }),
        );

        // no scene loaded so geometry cache is empty
        let pic = renderer.with_recording_cached(&"missing".to_string(), |_| {});
        assert!(pic.is_none());

        renderer.free();
    }
}
