use crate::cache::tile::RegionTileInfo;
use crate::node::schema::*;
use crate::painter::layer::Layer;
use crate::painter::{cvt, Painter};
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
use std::time::{Duration, Instant};

/// Callback type used to request a redraw from the host window.
pub type RequestRedrawCallback = Box<dyn Fn()>;

/// Type alias for tile information in frame planning
pub type FramePlanTileInfo = RegionTileInfo;

#[derive(Clone)]
pub struct FramePlan {
    /// cached tile keys with blur information
    pub tiles: Vec<FramePlanTileInfo>,
    /// when true, the renderer should schedule another frame to recache tiles
    pub should_repaint_all: bool,
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
pub struct RenderStats {
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

/// test rect in canvas space

/// ---------------------------------------------------------------------------
/// Renderer: manages backend, DPI, camera, and iterates over scene children
/// ---------------------------------------------------------------------------
pub struct Renderer {
    backend: Option<Backend>,
    scene: Option<Scene>,
    pub camera: Option<Camera2D>,
    prev_quantized_camera_transform: Option<math2::transform::AffineTransform>,
    pub image_repository: Rc<RefCell<ImageRepository>>,
    pub font_repository: Rc<RefCell<FontRepository>>,
    scene_cache: cache::scene::SceneCache,
    request_redraw: RequestRedrawCallback,
    needs_redraw: bool,
    debug_tiles: bool,
}

impl Renderer {
    pub fn new(request_redraw: RequestRedrawCallback) -> Self {
        let font_repository = FontRepository::new();
        let font_repository = Rc::new(RefCell::new(font_repository));
        let image_repository = ImageRepository::new();
        let image_repository = Rc::new(RefCell::new(image_repository));
        Self {
            backend: None,
            scene: None,
            camera: None,
            prev_quantized_camera_transform: None,
            image_repository,
            font_repository,
            scene_cache: cache::scene::SceneCache::new(),
            request_redraw,
            needs_redraw: false,
            debug_tiles: false,
        }
    }

    /// Access the cached scene data.
    pub fn scene_cache(&self) -> &cache::scene::SceneCache {
        &self.scene_cache
    }

    pub fn init_raster(width: i32, height: i32) -> *mut Surface {
        let surface =
            surfaces::raster_n32_premul((width, height)).expect("Failed to create raster surface");
        Box::into_raw(Box::new(surface))
    }

    pub fn set_backend(&mut self, backend: Backend) {
        self.backend = Some(backend);
    }

    pub fn add_font(&mut self, family: &str, bytes: &[u8]) {
        self.font_repository
            .borrow_mut()
            .insert(family.to_string(), bytes.to_vec());
    }

    /// Create an image from raw encoded bytes.
    pub fn add_image(&self, src: String, bytes: &[u8]) {
        let data = skia_safe::Data::new_copy(bytes);
        if let Some(image) = Image::from_encoded(data) {
            self.image_repository.borrow_mut().insert(src, image);
        }
    }

    /// Render the queued frame if any and return the completed statistics.
    pub fn flush(&mut self) -> Option<RenderStats> {
        if !self.needs_redraw {
            return None;
        }

        let start = Instant::now();

        let Some(scene_ptr) = self.scene.as_ref().map(|s| s as *const Scene) else {
            return None;
        };
        let Some(backend) = self.backend.as_ref() else {
            return None;
        };

        let surface = unsafe { &mut *backend.get_surface() };
        let scene = unsafe { &*scene_ptr };
        let width = surface.width() as f32;
        let height = surface.height() as f32;
        let mut canvas = surface.canvas();
        let rect = self.camera.as_ref().map(|c| c.rect());

        if self.scene_cache.tile.should_repaint_all() {
            self.scene_cache.tile.clear();
        }

        let frame = self.frame(
            rect.unwrap_or(rect::Rectangle::empty()),
            self.camera.as_ref().map(|c| c.get_zoom()).unwrap_or(1.0),
        );
        let paint = self.draw(&mut canvas, &frame, scene.background_color, width, height);

        let render_duration = start.elapsed();

        // update tile cache when zoom is stable
        if self.should_cache_tiles() {
            if let Some(camera) = &self.camera {
                self.scene_cache
                    .update_tiles(camera, surface, width, height);
            }
        }

        let flush_start = Instant::now();
        if let Some(mut gr_context) = surface.recording_context() {
            if let Some(mut direct_context) = gr_context.as_direct_context() {
                direct_context.flush_and_submit();
            }
        }
        let flush_duration = flush_start.elapsed();

        let stats = RenderStats {
            frame,
            draw: paint,
            frame_duration: render_duration,
            flush_duration,
            total_duration: render_duration + flush_duration,
        };

        self.needs_redraw = false;

        Some(stats)
    }

    /// Returns `true` if a frame has been queued but not yet flushed.
    pub fn has_pending_frame(&self) -> bool {
        self.needs_redraw
    }

    /// Enable or disable tile debug rendering.
    pub fn devtools_rendering_set_show_tiles(&mut self, debug: bool) {
        self.debug_tiles = debug;
    }

    /// Returns `true` if tile debug rendering is enabled.
    pub fn debug_tiles(&self) -> bool {
        self.debug_tiles
    }

    /// Invoke the request redraw callback.
    fn request_redraw(&self) {
        (self.request_redraw)();
    }

    pub fn free(&mut self) {
        if let Some(backend) = self.backend.take() {
            let surface = unsafe { Box::from_raw(backend.get_surface()) };
            if let Some(mut gr_context) = surface.recording_context() {
                if let Some(mut direct_context) = gr_context.as_direct_context() {
                    direct_context.abandon();
                }
            }
        }
    }

    /// Set the active camera. Returns `true` if the quantized transform changed.
    pub fn set_camera(&mut self, camera: Camera2D) -> bool {
        let quantized = camera.quantized_transform();
        let changed = match self.prev_quantized_camera_transform {
            Some(prev) => prev != quantized,
            None => true,
        };
        if changed {
            self.prev_quantized_camera_transform = Some(quantized);
        }
        let zoom = camera.get_zoom();
        self.scene_cache.tile.update_zoom(zoom);
        self.camera = Some(camera);
        changed
    }

    /// Load a scene into the renderer. Caching will be performed lazily during
    /// rendering based on the configured caching strategy.
    pub fn load_scene(&mut self, scene: Scene) {
        println!("load_scene: size={}", scene.nodes.len());
        self.scene_cache.update_geometry(&scene);
        self.scene_cache.update_layers(&scene);
        self.scene = Some(scene);
    }

    pub fn should_cache_tiles(&self) -> bool {
        self.scene_cache.tile.should_cache_tiles()
    }

    /// Mark the renderer as needing a redraw and request it from the host.
    pub fn queue(&mut self) {
        if !self.needs_redraw {
            self.needs_redraw = true;
            self.request_redraw();
        }
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
        let painter = Painter::new(
            canvas,
            self.font_repository.clone(),
            self.image_repository.clone(),
        );
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
    fn frame(&mut self, bounds: rect::Rectangle, zoom: f32) -> FramePlan {
        let __before_ll = Instant::now();
        let force_full_repaint = self.scene_cache.tile.needs_full_repaint();

        // Get tiles for the region with blur information and sorting
        let region_tiles = self.scene_cache.tile.get_region_tiles(&bounds, zoom);
        let visible_tiles: Vec<FramePlanTileInfo> = region_tiles.tiles().to_vec();
        let tile_rects: Vec<_> = region_tiles.tile_rects().to_vec();

        let region = if force_full_repaint {
            vec![bounds]
        } else {
            region::difference(bounds, &tile_rects)
        };

        let mut regions: Vec<(rect::Rectangle, Vec<usize>)> = Vec::new();

        for rect in region {
            let mut indices = self.scene_cache.intersects(rect);

            // TODO: sort is expensive
            indices.sort();

            regions.push((rect, indices));
        }

        let ll_len = regions.iter().map(|(_, indices)| indices.len()).sum();

        let __ll_duration = __before_ll.elapsed();

        FramePlan {
            tiles: visible_tiles,
            should_repaint_all: self.scene_cache.tile.should_repaint_all() || force_full_repaint,
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

        // Apply camera transform if present
        if let Some(camera) = &self.camera {
            canvas.concat(&cvt::sk_matrix(camera.view_matrix().matrix));
        }

        // draw image cache tiles
        for tk in plan.tiles.iter() {
            let tile_at_zoom = self.scene_cache.tile.get_tile(&tk.key);
            if let Some(tile_at_zoom) = tile_at_zoom {
                let image = &tile_at_zoom.image;
                let src = Rect::new(0.0, 0.0, image.width() as f32, image.height() as f32);
                let dst = Rect::from_xywh(
                    tk.key.0 as f32,
                    tk.key.1 as f32,
                    tk.key.2 as f32,
                    tk.key.3 as f32,
                );
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
                let layer = self.scene_cache.layers.layers[*idx].clone();
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
    use crate::node::{factory::NodeFactory, repository::NodeRepository};
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

        let mut renderer = Renderer::new(Box::new(|| {}));
        let surface_ptr = Renderer::init_raster(100, 100);
        renderer.set_backend(Backend::Raster(surface_ptr));
        renderer.load_scene(scene);
        renderer.queue();
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
        let mut renderer = Renderer::new(Box::new(|| {}));
        let surface_ptr = Renderer::init_raster(50, 50);
        renderer.set_backend(Backend::Raster(surface_ptr));

        // no scene loaded so geometry cache is empty
        let pic = renderer.with_recording_cached(&"missing".to_string(), |_| {});
        assert!(pic.is_none());

        renderer.free();
    }
}
