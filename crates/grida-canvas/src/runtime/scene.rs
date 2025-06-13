use crate::node::schema::*;
use crate::painter::{Painter, cvt};
use crate::{
    cache, rect,
    repository::{FontRepository, ImageRepository, NodeRepository},
    runtime::camera::Camera2D,
};
use skia_safe::{Image, Paint as SkPaint, Picture, PictureRecorder, Rect, Surface, surfaces};
use std::cell::RefCell;
use std::rc::Rc;

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

pub struct Renderer {
    backend: Option<Backend>,
    dpi: f32,
    logical_width: f32,
    logical_height: f32,
    pub camera: Option<Camera2D>,
    prev_quantized_camera_transform: Option<math2::transform::AffineTransform>,
    pub image_repository: Rc<RefCell<ImageRepository>>,
    pub font_repository: Rc<RefCell<FontRepository>>,
    scene_cache: cache::scene::SceneCache,
}

/// ---------------------------------------------------------------------------
/// Renderer: manages backend, DPI, camera, and iterates over scene children
/// ---------------------------------------------------------------------------

impl Renderer {
    pub fn new(width: f32, height: f32, dpi: f32) -> Self {
        let font_repository = FontRepository::new();
        let font_repository = Rc::new(RefCell::new(font_repository));
        let image_repository = ImageRepository::new();
        let image_repository = Rc::new(RefCell::new(image_repository));
        Self {
            backend: None,
            dpi,
            logical_width: width,
            logical_height: height,
            camera: None,
            prev_quantized_camera_transform: None,
            image_repository,
            font_repository,
            scene_cache: cache::scene::SceneCache::new(
                cache::picture::PictureCacheStrategy::default(),
            ),
        }
    }

    pub fn set_logical_size(&mut self, width: f32, height: f32) {
        self.logical_width = width;
        self.logical_height = height;
    }

    pub fn init_raster(width: i32, height: i32) -> *mut Surface {
        let surface =
            surfaces::raster_n32_premul((width, height)).expect("Failed to create raster surface");
        Box::into_raw(Box::new(surface))
    }

    pub fn set_backend(&mut self, backend: Backend) {
        self.backend = Some(backend);
    }

    pub fn register_image(&mut self, src: String, image: Image) {
        self.image_repository.borrow_mut().insert(src, image);
    }

    pub fn add_font(&mut self, family: &str, bytes: &[u8]) {
        self.font_repository
            .borrow_mut()
            .insert(family.to_string(), bytes.to_vec());
    }

    /// Create an image from raw encoded bytes.
    pub fn create_image(&self, bytes: &[u8]) -> Option<Image> {
        let data = skia_safe::Data::new_copy(bytes);
        Image::from_encoded(data)
    }

    pub fn flush(&self) {
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
        self.camera = Some(camera);
        changed
    }

    pub fn set_cache_strategy(&mut self, strategy: cache::picture::PictureCacheStrategy) {
        self.scene_cache.set_strategy(strategy);
    }

    /// Record and store the entire scene into the internal cache.
    /// This assumes the scene is static and only the camera transforms at runtime.
    pub fn cache_scene(&mut self, scene: &Scene) {
        match self.scene_cache.strategy().depth {
            0 => {
                if let Some(picture) = self.record_scene(scene) {
                    self.scene_cache.set_picture(picture);
                }
            }
            1 => {
                self.scene_cache.clear_node_pictures();
                if let Some(backend) = &self.backend {
                    let _surface = unsafe { &mut *backend.get_surface() };
                    self.scene_cache.update_geometry(scene);
                    for child_id in &scene.children {
                        let bounds = {
                            let cache = self.scene_cache.geometry();
                            cache.get_world_bounds(child_id)
                        };
                        if let (Some(node), Some(bounds)) = (scene.nodes.get(child_id), bounds) {
                            if let Some(picture) = self.record_node(node, &bounds, &scene.nodes) {
                                self.scene_cache.set_node_picture(child_id.clone(), picture);
                            }
                        }
                    }
                }
            }
            _ => {
                // For depths >1 we currently fall back to depth 1 behaviour
                self.scene_cache.clear_node_pictures();
                if let Some(backend) = &self.backend {
                    let _surface = unsafe { &mut *backend.get_surface() };
                    self.scene_cache.update_geometry(scene);
                    for child_id in &scene.children {
                        let bounds = {
                            let cache = self.scene_cache.geometry();
                            cache.get_world_bounds(child_id)
                        };
                        if let (Some(node), Some(bounds)) = (scene.nodes.get(child_id), bounds) {
                            if let Some(picture) = self.record_node(node, &bounds, &scene.nodes) {
                                self.scene_cache.set_node_picture(child_id.clone(), picture);
                            }
                        }
                    }
                }
            }
        }
    }

    /// Clear the cached scene picture.
    pub fn invalidate_cache(&mut self) {
        self.scene_cache.invalidate();
    }

    /// Record the entire scene into a [`Picture`].
    ///
    /// This skips camera transforms and visibility culling so the picture can
    /// be reused while the camera moves.
    pub fn record_scene(&mut self, scene: &Scene) -> Option<Picture> {
        if let Some(_backend) = &self.backend {
            self.scene_cache.update_geometry(scene);
            let geometry_cache = self.scene_cache.geometry();
            let mut union_bounds: Option<rect::Rect> = None;
            for child_id in &scene.children {
                if let Some(b) = geometry_cache.get_world_bounds(child_id) {
                    union_bounds = Some(match union_bounds {
                        Some(u) => rect::union(&[u, b]),
                        None => b,
                    });
                }
            }

            if let Some(bounds) = union_bounds {
                let mut recorder = PictureRecorder::new();
                let sk_bounds = Rect::new(bounds.x, bounds.y, bounds.x + bounds.width, bounds.y + bounds.height);
                let canvas = recorder.begin_recording(sk_bounds, None);
                let painter = Painter::new(canvas, self.font_repository.clone(), self.image_repository.clone());

                for child_id in &scene.children {
                    if let Some(node) = scene.nodes.get(child_id) {
                        painter.draw_node(node, &scene.nodes);
                    }
                }

                recorder.finish_recording_as_picture(None)
            } else {
                None
            }
        } else {
            None
        }
    }

    fn record_node(
        &self,
        node: &Node,
        bounds: &rect::Rect,
        repository: &NodeRepository,
    ) -> Option<Picture> {
        if self.backend.is_some() {
            let mut recorder = PictureRecorder::new();
            let sk_bounds = Rect::new(bounds.x, bounds.y, bounds.x + bounds.width, bounds.y + bounds.height);
            let canvas = recorder.begin_recording(sk_bounds, None);
            let painter = Painter::new(canvas, self.font_repository.clone(), self.image_repository.clone());
            painter.draw_node(node, repository);
            recorder.finish_recording_as_picture(None)
        } else {
            None
        }
    }

    // Render the scene
    pub fn render_scene(&mut self, scene: &Scene) {
        if let Some(backend) = &self.backend {
            // Fast path when the whole scene is cached
            if self.scene_cache.strategy().depth == 0 {
                if let Some(picture) = self.scene_cache.get_picture() {
                    let surface = unsafe { &mut *backend.get_surface() };
                    let width = surface.width() as f32;
                    let height = surface.height() as f32;
                    let canvas = surface.canvas();
                    canvas.save();

                    if let Some(bg_color) = scene.background_color {
                        let Color(r, g, b, a) = bg_color;
                        let color = skia_safe::Color::from_argb(a, r, g, b);
                        let mut paint = SkPaint::default();
                        paint.set_color(color);
                        canvas.draw_rect(Rect::new(0.0, 0.0, width, height), &paint);
                    }

                    let scale_x = self.logical_width / width;
                    let scale_y = self.logical_height / height;
                    canvas.scale((scale_x, scale_y));
                    canvas.scale((self.dpi, self.dpi));

                    if let Some(camera) = &self.camera {
                        let view_matrix = camera.view_matrix();
                        canvas.concat(&cvt::sk_matrix(view_matrix.matrix));
                    }

                    canvas.draw_picture(picture, None, None);
                    canvas.restore();
                    return;
                }
            }

            self.scene_cache.update_geometry(scene);
            let surface = unsafe { &mut *backend.get_surface() };
            let width = surface.width() as f32;
            let height = surface.height() as f32;
            let canvas = surface.canvas();
            canvas.save();

            // Paint background color first if present
            if let Some(bg_color) = scene.background_color {
                let Color(r, g, b, a) = bg_color;
                let color = skia_safe::Color::from_argb(a, r, g, b);
                let mut paint = SkPaint::default();
                paint.set_color(color);
                // Paint the entire canvas with the background color
                canvas.draw_rect(Rect::new(0.0, 0.0, width, height), &paint);
            }

            // Scale to logical size
            let scale_x = self.logical_width / width;
            let scale_y = self.logical_height / height;
            canvas.scale((scale_x, scale_y));

            // Apply DPI scaling
            canvas.scale((self.dpi, self.dpi));

            // Apply camera transform if present
            if let Some(camera) = &self.camera {
                let view_matrix = camera.view_matrix();
                canvas.concat(&cvt::sk_matrix(view_matrix.matrix));
            }

            // Render scene nodes
            if self.scene_cache.strategy().depth == 1 {
                for child_id in &scene.children {
                    if let Some(pic) = self.scene_cache.get_node_picture(child_id) {
                        canvas.draw_picture(pic, None, None);
                    } else {
                        self.render_node(child_id, &scene.nodes);
                    }
                }
            } else {
                for child_id in &scene.children {
                    self.render_node(child_id, &scene.nodes);
                }
            }

            canvas.restore();
        }
    }

    fn render_node(&self, id: &NodeId, repository: &NodeRepository) {
        if let Some(backend) = &self.backend {
            let surface = unsafe { &mut *backend.get_surface() };
            let canvas = surface.canvas();
            if let Some(node) = repository.get(id) {
                let painter = Painter::new(canvas, self.font_repository.clone(), self.image_repository.clone());
                painter.draw_node(node, repository);
            }
        }
    }
}
