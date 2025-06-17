use crate::node::schema::*;
use crate::painter::layer::Layer;
use crate::painter::{Painter, cvt};
use crate::{
    cache,
    repository::{FontRepository, ImageRepository},
    runtime::camera::Camera2D,
};
use math2::{Rectangle, rect};
use skia_safe::{
    Canvas, IRect, Image, Paint as SkPaint, Picture, PictureRecorder, Rect, Surface, surfaces,
};
use std::cell::RefCell;
use std::collections::{HashMap, HashSet};
use std::rc::Rc;
use std::time::{Duration, Instant};

pub struct FramePlan {
    /// tile rects
    pub tiles: Vec<rect::Rectangle>,
    /// all layers that intersects with the bounds
    pub indices: Vec<usize>,
    /// indicies to be skipped from painting
    pub indices_skip_paint: Vec<usize>,
    /// indicies to be painted
    pub indices_should_paint: Vec<usize>,
    pub display_list_duration: Duration,
    pub display_list_size: usize,
}

pub struct DrawResult {
    pub painter_duration: Duration,
    pub cache_picture_used: usize,
    pub cache_picture_size: usize,
    pub cache_geometry_size: usize,
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
static TEST_RECT: math2::Rectangle = Rectangle {
    x: 5500.0,
    y: -4000.0,
    width: 14279.0,
    height: 17458.0,
};

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
    test_tile: Option<Image>,
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
            test_tile: None,
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

            let tile_rects: &[math2::Rectangle] = if self.test_tile.is_none() {
                &[]
            } else {
                &[TEST_RECT]
            };

            let frame = self.frame(rect.unwrap_or(rect::Rectangle::empty()), tile_rects);
            let paint = self.draw(&mut canvas, &frame, scene.background_color, width, height);

            let encode_duration = start.elapsed();

            if rect.is_some() && self.test_tile.is_none() {
                // if the test rect fully within the rect
                let is_within = rect.unwrap().contains(&TEST_RECT);
                // let is_within = math2::rect::contains(&rect.unwrap(), &TEST_RECT);
                println!(
                    "contains: {}, rect: {:?}, test_rect: {:?}",
                    is_within,
                    rect.unwrap(),
                    TEST_RECT
                );
                if is_within {
                    // convert the test rect to screen (surface) space
                    let surface_rect = math2::rect::transform(
                        TEST_RECT,
                        &self.camera.as_ref().unwrap().view_matrix(),
                    );

                    println!("surface_rect: {:?}", surface_rect);
                    //
                    let image = surface.image_snapshot_with_bounds(IRect::from_xywh(
                        surface_rect.x as i32,
                        surface_rect.y as i32,
                        surface_rect.width as i32,
                        surface_rect.height as i32,
                    ));
                    self.test_tile = image;
                }
                //
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
        // bounds: &rect::Rectangle,
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
    fn frame(&mut self, bounds: rect::Rectangle, tiles: &[rect::Rectangle]) -> FramePlan {
        let __before_ll = Instant::now();

        // all layers intersects with the bounds
        let mut intersects = self.scene_cache.intersects(bounds);
        intersects.sort();
        let ll_len = intersects.len();

        // all layers that are fully contained within the tiles (holes)
        let mut subtractions: HashSet<usize> = HashSet::new();
        for hole in tiles {
            subtractions.extend(self.scene_cache.contains(&hole));
        }

        // all layers that should be painted
        let mut indices = Vec::new();
        for idx in &intersects {
            if !subtractions.contains(&idx) {
                indices.push(*idx);
            }
        }

        let __ll_duration = __before_ll.elapsed();

        FramePlan {
            indices: intersects.clone(),
            tiles: tiles.to_vec(),
            indices_skip_paint: subtractions.into_iter().collect(),
            indices_should_paint: indices.clone(),
            display_list_duration: __ll_duration,
            display_list_size: ll_len,
        }
    }

    /// Draw the scene to the canvas.
    /// - canvas: the canvas to render to
    /// - indices: the indices of the layers to draw
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

        for tile in &plan.tiles {
            let image = self.test_tile.as_ref().unwrap();
            let src = Rect::new(0.0, 0.0, image.width() as f32, image.height() as f32);
            let dst = Rect::from_xywh(tile.x, tile.y, tile.width, tile.height);
            let paint = SkPaint::default();
            canvas.draw_image_rect(
                image,
                Some((&src, skia_safe::canvas::SrcRectConstraint::Fast)),
                dst,
                &paint,
            );
        }

        for idx in &plan.indices_should_paint {
            let layer = self.scene_cache.layers.layers[*idx].clone();
            let picture = self.with_recording_cached(&layer.id(), |painter| {
                painter.draw_layer(&layer);
            });

            if let Some(pic) = picture {
                canvas.draw_picture(pic, None, None);
                cache_picture_used += 1;
            }
        }

        let __painter_duration = __before_paint.elapsed();

        canvas.restore();

        DrawResult {
            painter_duration: __painter_duration,
            cache_picture_used,
            cache_picture_size: self.scene_cache.picture.len(),
            cache_geometry_size: self.scene_cache.geometry.len(),
        }
        //
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
