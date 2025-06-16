use crate::cache::tile::TileCache;
use crate::node::schema::*;
use crate::painter::layer::LayerList;
use crate::painter::{Painter, cvt};
use crate::{
    cache,
    repository::{FontRepository, ImageRepository, NodeRepository},
    runtime::camera::Camera2D,
};
use math2::rect;
use skia_safe::{
    Canvas, Image, Paint as SkPaint, Picture, PictureRecorder, Rect, Surface, surfaces,
};
use std::cell::RefCell;
use std::rc::Rc;
use std::time::{Duration, Instant};

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
    scene: Option<Scene>,
    pub camera: Option<Camera2D>,
    prev_quantized_camera_transform: Option<math2::transform::AffineTransform>,
    pub image_repository: Rc<RefCell<ImageRepository>>,
    pub font_repository: Rc<RefCell<FontRepository>>,
    scene_cache: cache::scene::SceneCache,
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
        self.camera = Some(camera);
        changed
    }

    /// Load a scene into the renderer. Caching will be performed lazily during
    /// rendering based on the configured caching strategy.
    pub fn load_scene(&mut self, scene: Scene) {
        self.scene = Some(scene);
    }

    /// Render the currently loaded scene if any. and report the time it took.
    pub fn render(&mut self) -> Option<(Duration, Duration, Duration)> {
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
            self.encode_scene(scene, &mut canvas, width, height, rect);
        }
        let encode_duration = start.elapsed();

        self.flush();

        let duration = start.elapsed();

        Some((duration, encode_duration, duration - encode_duration))
    }

    /// Clear the cached scene picture.
    pub fn invalidate_cache(&mut self) {
        self.scene_cache.invalidate();
    }

    fn capture_node_picture(
        &self,
        node: &Node,
        bounds: &rect::Rectangle,
        repository: &NodeRepository,
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
        painter.draw_node_recursively(node, repository);
        recorder.finish_recording_as_picture(None)
    }

    /// Encode the scene for flushing.
    /// Arguments:
    /// - scene: the scene to encode
    /// - canvas: the canvas to encode to
    /// - width: the width of the canvas
    /// - height: the height of the canvas
    /// - rect: the bounding rect to be encoded (in world space)
    fn encode_scene(
        &mut self,
        scene: &Scene,
        canvas: &Canvas,
        width: f32,
        height: f32,
        rect: Option<rect::Rectangle>,
    ) {
        self.scene_cache.update_geometry(scene);

        canvas.clear(skia_safe::Color::TRANSPARENT);

        // Paint background color first if present
        if let Some(bg_color) = scene.background_color {
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

        let painter = Painter::new(
            canvas,
            self.font_repository.clone(),
            self.image_repository.clone(),
        );

        // flatten the scene
        let ll = LayerList::from_scene(scene, &self.scene_cache.geometry, rect);
        println!("number of layers: {}", ll.len());

        for layer in ll.layers {
            // println!("drawing layer: {:?} ", layer);
            painter.draw_layer(&layer);
        }

        // // Render scene nodes
        // for child_id in &scene.children {
        //     if let Some(pic) = self.scene_cache.get_node_picture(child_id) {
        //         canvas.draw_picture(pic, None, None);
        //     } else {
        //         let bounds = {
        //             let cache = self.scene_cache.geometry();
        //             cache.get_world_bounds(child_id)
        //         };
        //         let node = scene.nodes.get(child_id).unwrap();
        //         if let Some(b) = bounds {
        //             if let Some(pic) = self.capture_node_picture(node, &b, &scene.nodes) {
        //                 canvas.draw_picture(&pic, None, None);
        //                 self.scene_cache.set_node_picture(child_id.clone(), pic);
        //                 continue;
        //             }
        //         }
        //         painter.draw_node_recursively(node, &scene.nodes);
        //     }
        // }

        canvas.restore();
    }

    // if let Some(camera) = &self.camera {
    //     let tc = &mut self.scene_cache.tile;
    //     let raw_zoom = camera.get_zoom();
    //     let rect = camera.rect();

    //     // 1. get the quantized bounds / aligned to the tile size
    //     let (level, zoom) = tc.quantize_zoom(raw_zoom);
    //     // println!(
    //     //     "raw_zoom: {}, level: {}, quantized_zoom: {}",
    //     //     raw_zoom, level, zoom
    //     // );

    //     let q = math2::rect::quantize(rect, 512.0);
    //     println!("rect: {:?}", q);

    //     let size = tc.tile_world_size(zoom);
    //     let start_col = (rect.x / size).floor() as i32;
    //     let end_col = ((rect.x + rect.width) / size).ceil() as i32;
    //     let start_row = (rect.y / size).floor() as i32;
    //     let end_row = ((rect.y + rect.height) / size).ceil() as i32;

    //     // println!(
    //     //     "zoom: {}, rect: {:?} col: {}..{} row: {}..{} cells: {}",
    //     //     zoom,
    //     //     rect,
    //     //     start_col,
    //     //     end_col,
    //     //     start_row,
    //     //     end_row,
    //     //     (end_col - start_col) * (end_row - start_row)
    //     // );

    //     // for col in start_col..end_col {
    //     //     for row in start_row..end_row {
    //     //         let key: (u8, i32, i32) = (level, col, row);
    //     //         let subset = skia_safe::IRect::from_xywh(
    //     //             col as i32 * size as i32,
    //     //             row as i32 * size as i32,
    //     //             size as i32,
    //     //             size as i32,
    //     //         );

    //     //         if !tc.has(key) {
    //     //             let image = surface.image_snapshot_with_bounds(subset);
    //     //             // let image = image.make_subset(surface.direct_context().as_mut(), subset);
    //     //             if let Some(image) = image {
    //     //                 tc.insert_tile(key, image, (size, size), rect);
    //     //             }

    //     //             // println!("key: {:?}", key);
    //     //         }
    //     //     }
    //     // }
    //     // print the number of tiles
    //     // println!("number of tiles: {}", tc.len());
    // }
}
