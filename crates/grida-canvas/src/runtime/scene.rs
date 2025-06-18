use crate::cache::tile::TileRectKey;
use crate::node::schema::*;
use crate::painter::layer::Layer;
use crate::painter::{Painter, cvt};
use crate::{
    cache,
    repository::{FontRepository, ImageRepository},
    runtime::camera::Camera2D,
};

use math2::{self, rect, region};
use skia_safe::{
    Canvas, IRect, Image, Paint as SkPaint, Picture, PictureRecorder, Rect, Surface, surfaces,
};
use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;
use std::time::{Duration, Instant};

/// Screen space tile size in pixels
const TILE_SIZE_PX: f32 = 512.0;
/// Minimum zoom level to enable image caching
const MIN_ZOOM_FOR_CACHE: f32 = 0.5;
/// Debounce duration after zooming before capturing tiles
const ZOOM_DEBOUNCE: Duration = Duration::from_millis(150);

pub struct FramePlan {
    /// tile keys
    pub tiles: Vec<TileRectKey>,
    /// regions with their intersecting indices
    pub regions: Vec<(rect::Rectangle, Vec<usize>)>,
    pub display_list_duration: Duration,
    pub display_list_size_estimated: usize,
}

pub struct DrawResult {
    pub painter_duration: Duration,
    pub cache_picture_used: usize,
    pub cache_picture_size: usize,
    pub cache_geometry_size: usize,
    pub tiles_total: usize,
    pub tiles_used: usize,
}

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
    tiles: HashMap<TileRectKey, Rc<Image>>,
    prev_zoom: Option<f32>,
    zoom_changed_at: Option<Instant>,
}

impl Renderer {
    pub fn new() -> Self {
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
            tiles: HashMap::new(),
            prev_zoom: None,
            zoom_changed_at: None,
        }
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
        let image = Image::from_encoded(data);
        if let Some(image) = image {
            self.image_repository.borrow_mut().insert(src, image);
        }
    }

    fn flush(&self) {
        if let Some(backend) = &self.backend {
            let surface = unsafe { &mut *backend.get_surface() };
            if let Some(mut gr_context) = surface.recording_context() {
                if let Some(mut direct_context) = gr_context.as_direct_context() {
                    direct_context.flush_and_submit();
                }
            }
        }
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
        if self
            .prev_zoom
            .map_or(true, |z| (z - zoom).abs() > f32::EPSILON)
        {
            self.tiles.clear();
            self.zoom_changed_at = Some(Instant::now());
            self.prev_zoom = Some(zoom);
        }
        self.camera = Some(camera);
        changed
    }

    /// Load a scene into the renderer. Caching will be performed lazily during
    /// rendering based on the configured caching strategy.
    pub fn load_scene(&mut self, scene: Scene) {
        println!("load_scene: {:?}", scene.nodes.len());
        self.scene_cache.update_geometry(&scene);
        self.scene_cache.update_layers(&scene);
        self.scene = Some(scene);
    }

    /// Render the currently loaded scene if any. and report the time it took.
    pub fn render(&mut self) -> Option<RenderStats> {
        let start = Instant::now();

        if self.scene.is_none() {
            return None;
        }

        if let Some(scene_ptr) = self.scene.as_ref().map(|s| s as *const Scene) {
            // SAFETY: the pointer is only used for the duration of this call
            // and the scene is not mutated while borrowed.
            let surface = unsafe { &mut *self.backend.as_ref().unwrap().get_surface() };
            let scene = unsafe { &*scene_ptr };
            let width = surface.width() as f32;
            let height = surface.height() as f32;
            let mut canvas = surface.canvas();
            let rect = self.camera.as_ref().map(|c| c.rect());

            let frame = self.frame(
                rect.unwrap_or(rect::Rectangle::empty()),
                &self.tiles.clone(),
            );
            let paint = self.draw(&mut canvas, &frame, scene.background_color, width, height);

            let encode_duration = start.elapsed();

            // update tile cache when zoom is stable
            if self
                .zoom_changed_at
                .map(|t| t.elapsed() >= ZOOM_DEBOUNCE)
                .unwrap_or(true)
            {
                self.update_tiles(surface, width, height);
            }

            self.flush();

            let duration = start.elapsed();

            return Some(RenderStats {
                frame,
                draw: paint,
                frame_duration: encode_duration,
                flush_duration: duration - encode_duration,
                total_duration: duration,
            });
        }

        return None;
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

        let bounds = self.scene_cache.geometry.get_render_bounds(&id).unwrap();
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
    /// - rect: the bounding rect to be rendered (in world space)
    fn frame(
        &mut self,
        bounds: rect::Rectangle,
        tiles: &HashMap<TileRectKey, Rc<Image>>,
    ) -> FramePlan {
        let __before_ll = Instant::now();

        let tile_rects: Vec<_> = tiles.keys().map(|k| k.to_rect()).collect();
        let region = region::difference(bounds, &tile_rects);

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
            tiles: tiles.keys().cloned().collect(),
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

        for tk in plan.tiles.iter() {
            let image = self.tiles.get(tk);
            let image = image.unwrap();
            let src = Rect::new(0.0, 0.0, image.width() as f32, image.height() as f32);
            let dst = Rect::from_xywh(tk.0 as f32, tk.1 as f32, tk.2 as f32, tk.3 as f32);
            let paint = SkPaint::default();
            canvas.draw_image_rect(
                image,
                Some((&src, skia_safe::canvas::SrcRectConstraint::Fast)),
                dst,
                &paint,
            );
        }

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
            tiles_total: self.tiles.len(),
            tiles_used: plan.tiles.len(),
        }
        //
    }

    fn update_tiles(&mut self, surface: &mut Surface, width: f32, height: f32) {
        let camera = match &self.camera {
            Some(c) => c,
            None => return,
        };

        let zoom = camera.get_zoom();
        if zoom > MIN_ZOOM_FOR_CACHE {
            return;
        }

        let world_size = TILE_SIZE_PX / zoom;
        let rect = camera.rect();

        let start_col = (rect.x / world_size).floor() as i32;
        let end_col = ((rect.x + rect.width) / world_size).ceil() as i32;
        let start_row = (rect.y / world_size).floor() as i32;
        let end_row = ((rect.y + rect.height) / world_size).ceil() as i32;

        for col in start_col..end_col {
            for row in start_row..end_row {
                let world_rect = rect::Rectangle {
                    x: col as f32 * world_size,
                    y: row as f32 * world_size,
                    width: world_size,
                    height: world_size,
                };

                // skip if no nodes intersect with the tile
                if self.scene_cache.intersects(world_rect).is_empty() {
                    continue;
                }

                let screen_rect = rect::transform(world_rect, &camera.view_matrix());

                if screen_rect.x >= 0.0
                    && screen_rect.y >= 0.0
                    && screen_rect.x + screen_rect.width <= width
                    && screen_rect.y + screen_rect.height <= height
                {
                    let key = TileRectKey(
                        world_rect.x.round() as i32,
                        world_rect.y.round() as i32,
                        world_rect.width.round() as u32,
                        world_rect.height.round() as u32,
                    );
                    if !self.tiles.contains_key(&key) {
                        if let Some(image) = surface.image_snapshot_with_bounds(IRect::from_xywh(
                            screen_rect.x as i32,
                            screen_rect.y as i32,
                            TILE_SIZE_PX as i32,
                            TILE_SIZE_PX as i32,
                        )) {
                            self.tiles.insert(key, Rc::new(image));
                        }
                    }
                }
            }
        }
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

        let mut renderer = Renderer::new();
        let surface_ptr = Renderer::init_raster(100, 100);
        renderer.set_backend(Backend::Raster(surface_ptr));
        renderer.load_scene(scene);
        renderer.render();

        let bounds = renderer
            .scene_cache
            .geometry
            .get_render_bounds(&rect_id)
            .unwrap();
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
}
