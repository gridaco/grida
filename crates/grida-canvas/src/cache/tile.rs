use crate::runtime::camera::Camera2D;
use math2::rect::{self, Rectangle};
use skia_safe::{IRect, Image, Surface};
use std::collections::HashMap;
use std::rc::Rc;
use std::time::{Duration, Instant};

/// Screen space tile size in pixels
const TILE_SIZE_PX: f32 = 512.0;
/// Caching is enabled while the camera zoom is at or below this level.
/// When zooming in beyond this value the cache is cleared and disabled
/// as the picture based rendering is fast enough.
const MAX_ZOOM_FOR_CACHE: f32 = 2.0;
/// Debounce duration after zooming before capturing tiles
const CACHE_DEBOUNCE_BY_ZOOM: Duration = Duration::from_millis(500);

/// (x, y, width, height) in canvas space
#[derive(Debug, Clone, Copy, Hash, PartialEq, Eq)]
pub struct TileRectKey(pub i32, pub i32, pub u32, pub u32);

impl TileRectKey {
    pub fn to_rect(&self) -> Rectangle {
        Rectangle {
            x: self.0 as f32,
            y: self.1 as f32,
            width: self.2 as f32,
            height: self.3 as f32,
        }
    }
}

/// Simple raster tile cache used by the renderer.
#[derive(Debug, Clone)]
pub struct ImageTileCache {
    tiles: HashMap<TileRectKey, Rc<Image>>,
    prev_zoom: Option<f32>,
    zoom_changed_at: Option<Instant>,
}

impl Default for ImageTileCache {
    fn default() -> Self {
        Self {
            tiles: HashMap::new(),
            prev_zoom: None,
            zoom_changed_at: None,
        }
    }
}

impl ImageTileCache {
    pub fn new() -> Self {
        Self::default()
    }

    /// Access currently cached raster tiles.
    pub fn tiles(&self) -> &HashMap<TileRectKey, Rc<Image>> {
        &self.tiles
    }

    /// Remove all cached tiles.
    pub fn clear(&mut self) {
        self.tiles.clear();
    }

    /// Returns true if the cache should repaint all tiles due to a zoom change
    /// that has settled for the debounce duration.
    pub fn should_repaint_all(&self) -> bool {
        self.zoom_changed_at
            .map(|t| t.elapsed() >= CACHE_DEBOUNCE_BY_ZOOM)
            .unwrap_or(false)
    }

    /// Whether tiles should be cached based on zoom change debounce.
    pub fn should_cache_tiles(&self) -> bool {
        self.zoom_changed_at
            .map(|t| t.elapsed() >= CACHE_DEBOUNCE_BY_ZOOM)
            .unwrap_or(true)
    }

    /// Notify the cache about a camera zoom change.
    pub fn update_zoom(&mut self, zoom: f32) {
        if self
            .prev_zoom
            .map_or(true, |z| (z - zoom).abs() > f32::EPSILON)
        {
            if zoom > MAX_ZOOM_FOR_CACHE {
                // Disable caching when sufficiently zoomed in - picture mode
                // is fast enough at this scale.
                self.tiles.clear();
                self.zoom_changed_at = None;
            } else {
                // Mark tiles as outdated so they are refreshed after debounce.
                self.zoom_changed_at = Some(Instant::now());
            }
            self.prev_zoom = Some(zoom);
        }
    }

    /// Capture visible region tiles from the provided surface.
    pub fn update_tiles<F>(
        &mut self,
        camera: &Camera2D,
        width: f32,
        height: f32,
        surface: &mut Surface,
        mut intersects: F,
    ) where
        F: FnMut(Rectangle) -> bool,
    {
        let zoom = camera.get_zoom();
        if zoom > MAX_ZOOM_FOR_CACHE {
            // Caching disabled when zoomed in beyond the threshold
            self.tiles.clear();
            self.zoom_changed_at = None;
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
                let world_rect = Rectangle {
                    x: col as f32 * world_size,
                    y: row as f32 * world_size,
                    width: world_size,
                    height: world_size,
                };

                if !intersects(world_rect) {
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
        self.zoom_changed_at = None;
    }
}
