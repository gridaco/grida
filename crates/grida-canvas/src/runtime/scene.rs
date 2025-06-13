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
use std::time::Instant;

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
    backend: Option<Backend>,
    dpi: f32,
    logical_width: f32,
    logical_height: f32,
    scene: Option<Scene>,
    pub camera: Option<Camera2D>,
    prev_quantized_camera_transform: Option<math2::transform::AffineTransform>,
    pub image_repository: Rc<RefCell<ImageRepository>>,
    pub font_repository: Rc<RefCell<FontRepository>>,
    scene_cache: cache::scene::SceneCache,
}

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
            scene: None,
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

    /// Load a scene into the renderer. Caching will be performed lazily during
    /// rendering based on the configured caching strategy.
    pub fn load_scene(&mut self, scene: Scene) {
        self.scene = Some(scene);
    }

    /// Render the currently loaded scene if any.
    pub fn render(&mut self) {
        if let Some(scene) = self.scene.as_ref() {
            let scene_clone = scene.clone();
            self.render_scene(&scene_clone);
        }
    }

    /// Clear the cached scene picture.
    pub fn invalidate_cache(&mut self) {
        self.scene_cache.invalidate();
    }

    // /// Record the entire scene into a [`Picture`].
    // ///
    // /// This skips camera transforms and visibility culling so the picture can
    // /// be reused while the camera moves.
    // fn capture_scene_picture(&mut self, scene: &Scene) -> Option<Picture> {
    //     let start = Instant::now();
    //     let result = if let Some(_backend) = &self.backend {
    //         self.scene_cache.update_geometry(scene);
    //         let geometry_cache = self.scene_cache.geometry();
    //         let mut union_bounds: Option<rect::Rect> = None;
    //         for child_id in &scene.children {
    //             if let Some(b) = geometry_cache.get_world_bounds(child_id) {
    //                 union_bounds = Some(match union_bounds {
    //                     Some(u) => rect::union(&[u, b]),
    //                     None => b,
    //                 });
    //             }
    //         }

    //         if let Some(bounds) = union_bounds {
    //             let mut recorder = PictureRecorder::new();
    //             let sk_bounds = Rect::new(
    //                 bounds.x,
    //                 bounds.y,
    //                 bounds.x + bounds.width,
    //                 bounds.y + bounds.height,
    //             );
    //             let canvas = recorder.begin_recording(sk_bounds, None);
    //             let painter = Painter::new(
    //                 canvas,
    //                 self.font_repository.clone(),
    //                 self.image_repository.clone(),
    //             );

    //             for child_id in &scene.children {
    //                 if let Some(node) = scene.nodes.get(child_id) {
    //                     painter.draw_node_recursively(node, &scene.nodes);
    //                 }
    //             }

    //             recorder.finish_recording_as_picture(None)
    //         } else {
    //             None
    //         }
    //     } else {
    //         None
    //     };
    //     let duration = start.elapsed();
    //     println!("capture_scene_picture took: {:?}", duration);
    //     result
    // }

    fn capture_node_picture(
        &self,
        node: &Node,
        bounds: &rect::Rect,
        repository: &NodeRepository,
    ) -> Option<Picture> {
        if self.backend.is_some() {
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
            painter.draw_node_recursively(node, repository);
            recorder.finish_recording_as_picture(None)
        } else {
            None
        }
    }

    // Render the scene
    fn render_scene(&mut self, scene: &Scene) {
        if self.backend.is_some() {
            let start = Instant::now();

            self.scene_cache.update_geometry(scene);
            let surface = unsafe { &mut *self.backend.as_ref().unwrap().get_surface() };
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

            let painter = Painter::new(
                canvas,
                self.font_repository.clone(),
                self.image_repository.clone(),
            );

            // Render scene nodes
            if self.scene_cache.strategy().depth > 0 {
                for child_id in &scene.children {
                    if let Some(pic) = self.scene_cache.get_node_picture(child_id) {
                        canvas.draw_picture(pic, None, None);
                    } else {
                        let bounds = {
                            let cache = self.scene_cache.geometry();
                            cache.get_world_bounds(child_id)
                        };
                        let node = scene.nodes.get(child_id).unwrap();
                        if let Some(b) = bounds {
                            if let Some(pic) = self.capture_node_picture(node, &b, &scene.nodes) {
                                canvas.draw_picture(&pic, None, None);
                                self.scene_cache.set_node_picture(child_id.clone(), pic);
                                continue;
                            }
                        }
                        painter.draw_node_recursively(node, &scene.nodes);
                    }
                }
            }

            let duration = start.elapsed();
            // log time + number of cached nodes
            println!(
                "caching strategy render for {} cached nodes with depth {} took: {:?}",
                self.scene_cache.picture().len(),
                self.scene_cache.picture().depth(),
                duration,
            );

            canvas.restore();
        }
    }
}
