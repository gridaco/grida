use crate::runtime::camera::Camera2D;
use math2::rect::{self, Rectangle};
use skia_safe::{IRect, Image, Surface};
use std::collections::HashMap;
use std::rc::Rc;
use std::time::{Duration, Instant};

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

#[derive(Debug, Clone)]
pub struct TileAtZoom {
    pub image: Rc<Image>,
    pub zoom: f32,
}

/// Information about a tile including whether it should be blurred
#[derive(Debug, Clone)]
pub struct RegionTileInfo {
    pub key: TileRectKey,
    /// When true, the tile should be blurred as it was captured at a lower zoom level
    /// (lower resolution) than the current view
    pub blur: bool,
    /// The blur radius to use for this tile (adaptive by zoom difference)
    pub blur_radius: f32,
    /// The zoom level at which this tile was snapshotted
    pub zoom: f32,
}

/// A collection of tiles for a specific region with blur information and sorting.
/// This encapsulates the logic for retrieving tiles from the cache and calculating
/// blur parameters based on zoom differences.
#[derive(Debug, Clone)]
pub struct RegionTiles {
    pub tiles: Vec<RegionTileInfo>,
    pub tile_rects: Vec<Rectangle>,
}

impl RegionTiles {
    /// Create a new RegionTiles instance with tiles filtered from the cache
    /// for the given bounds and current zoom level.
    pub fn new(cache: &ImageTileCache, bounds: &Rectangle, current_zoom: f32) -> Self {
        let mut tiles: Vec<RegionTileInfo> = Vec::new();
        let mut tile_rects: Vec<Rectangle> = Vec::new();

        const BLUR_SCALE: f32 = 2.0;
        const MAX_BLUR_RADIUS: f32 = 16.0;

        // Filter tiles that intersect with the current viewport bounds
        for key in cache.filter(bounds) {
            let tile_at_zoom = cache.get_tile(key);
            let (should_blur, blur_radius, tile_zoom) = if let Some(tile) = tile_at_zoom {
                let zoom_diff = current_zoom / tile.zoom;
                if zoom_diff > 1.0 + f32::EPSILON {
                    let blur_radius = ((zoom_diff - 1.0) * BLUR_SCALE).clamp(0.0, MAX_BLUR_RADIUS);
                    (true, blur_radius, tile.zoom)
                } else {
                    (false, 0.0, tile.zoom)
                }
            } else {
                (false, 0.0, 0.0)
            };

            tiles.push(RegionTileInfo {
                key: *key,
                blur: should_blur,
                blur_radius,
                zoom: tile_zoom,
            });
            tile_rects.push(key.to_rect());
        }

        // Sort tiles by zoom difference from current zoom (closest to current zoom last)
        // This ensures highest quality tiles are drawn on top
        tiles.sort_by(|a, b| {
            let diff_a = (current_zoom - a.zoom).abs();
            let diff_b = (current_zoom - b.zoom).abs();
            diff_b
                .partial_cmp(&diff_a)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        Self { tiles, tile_rects }
    }

    /// Get the tile information for rendering
    pub fn tiles(&self) -> &[RegionTileInfo] {
        &self.tiles
    }

    /// Get the tile rectangles for region calculation
    pub fn tile_rects(&self) -> &[Rectangle] {
        &self.tile_rects
    }

    /// Get the number of tiles in this region
    pub fn len(&self) -> usize {
        self.tiles.len()
    }
}

// /// The clip rect should be applied to this tile
// // pub cliprect: Rectangle,
// enum ImageTileCacheState {
//     /// only use matching tiles
//     Default,
//     /// forces to use the cache even for invalid regions
//     ForceCache,
// }

/// Simple raster tile cache used by the renderer.
///
/// This cache maintains two types of tiles:
/// 1. Regular tiles at various zoom levels for current viewport coverage
/// 2. Lowest zoom tiles as explicit fallbacks for zoom out optimization
///
/// Why we save lowest zoom tiles explicitly:
/// 1. Zoom out optimization: When zooming out, we need tiles at lower zoom levels.
///    Without explicit lowest zoom caching, we'd have no way to optimize zoom out
///    as we'd need to re-render everything at the new zoom level.
/// 2. Memory efficiency: Lowest zoom means fewer tiles to cover the same area,
///    keeping memory usage minimal while providing essential fallback coverage.
/// 3. Progressive quality: Allows smooth transitions between zoom levels by
///    providing immediate fallback tiles while higher quality tiles load.
#[derive(Debug, Clone)]
pub struct ImageTileCache {
    tile_size: u16,
    tiles: HashMap<TileRectKey, TileAtZoom>,
    /// The lowest zoom level resolved, even if at least 1 tile exists.
    /// This is used to track the most zoomed-out level we've cached,
    /// ensuring we always have fallback tiles for zoom out operations.
    lowest_zoom: Option<f32>,
    /// Keys to tiles that are at the lowest zoom level.
    /// These tiles are protected from being cleared during zoom changes
    /// and serve as essential fallbacks for zoom out optimization.
    /// Since lowest zoom means fewer tiles to cover the same area,
    /// keeping these in memory is memory-efficient while providing
    /// critical coverage for smooth zoom out operations.
    lowest_zoom_indices: std::collections::HashSet<TileRectKey>,
    prev_zoom: Option<f32>,
    zoom_changed_at: Option<Instant>,
    /// Caching is enabled while the camera zoom is at or below this level.
    /// When zooming in beyond this value the cache is cleared and disabled
    /// as the picture based rendering is fast enough.
    pub max_zoom_for_cache: f32,
    /// Flag indicating that a full repaint is required to refresh tiles
    /// after the cache was cleared due to a zoom change.
    no_cache_next: bool,
}

impl Default for ImageTileCache {
    fn default() -> Self {
        Self {
            tile_size: 512,
            tiles: HashMap::new(),
            lowest_zoom: None,
            lowest_zoom_indices: std::collections::HashSet::new(),
            prev_zoom: None,
            zoom_changed_at: None,
            max_zoom_for_cache: 2.0,
            no_cache_next: false,
        }
    }
}

impl ImageTileCache {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn from_size(tile_size: u16) -> Self {
        Self {
            tile_size,
            tiles: HashMap::new(),
            lowest_zoom: None,
            lowest_zoom_indices: std::collections::HashSet::new(),
            prev_zoom: None,
            zoom_changed_at: None,
            max_zoom_for_cache: 2.0,
            no_cache_next: false,
        }
    }

    pub fn with_max_zoom(mut self, max_zoom: f32) -> Self {
        self.max_zoom_for_cache = max_zoom;
        self
    }

    /// Access currently cached raster tiles.
    pub fn tiles(&self) -> &HashMap<TileRectKey, TileAtZoom> {
        &self.tiles
    }

    /// Get the lowest zoom level resolved.
    pub fn lowest_zoom(&self) -> Option<f32> {
        self.lowest_zoom
    }

    /// Get the keys of tiles at the lowest zoom level.
    pub fn lowest_zoom_indices(&self) -> &std::collections::HashSet<TileRectKey> {
        &self.lowest_zoom_indices
    }

    /// Get a tile from regular storage only.
    /// Lowest zoom tiles are maintained separately for future use.
    pub fn get_tile(&self, key: &TileRectKey) -> Option<&TileAtZoom> {
        self.tiles.get(key)
    }

    /// Get all tiles that intersect with the given bounds (regular tiles only).
    /// Returns tiles sorted by zoom level (lowest first) so lower resolution tiles
    /// are drawn below higher resolution tiles.
    pub fn filter(&self, bounds: &Rectangle) -> Vec<&TileRectKey> {
        let mut keys: Vec<&TileRectKey> = self
            .tiles
            .iter()
            .filter_map(|(key, _)| {
                if rect::intersects(&key.to_rect(), bounds) {
                    Some(key)
                } else {
                    None
                }
            })
            .collect();

        // Sort by zoom level in ascending order (lowest zoom first)
        keys.sort_by(|a, b| {
            let zoom_a = self
                .tiles
                .get(*a)
                .map(|tile| tile.zoom)
                .unwrap_or(f32::INFINITY);
            let zoom_b = self
                .tiles
                .get(*b)
                .map(|tile| tile.zoom)
                .unwrap_or(f32::INFINITY);
            zoom_a
                .partial_cmp(&zoom_b)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        keys
    }

    /// Remove all cached tiles (but preserve lowest zoom tiles).
    ///
    /// Lowest zoom tiles are preserved because:
    /// 1. They provide essential fallback coverage for zoom out operations
    /// 2. They represent minimal memory usage while covering large areas
    /// 3. Without them, zoom out would require expensive re-rendering
    pub fn clear(&mut self) {
        // Only clear tiles that are not in lowest_zoom_indices
        self.tiles
            .retain(|key, _| self.lowest_zoom_indices.contains(key));
        self.no_cache_next = true;
    }

    /// Remove all tiles including lowest zoom tiles.
    pub fn clear_all(&mut self) {
        self.tiles.clear();
        self.lowest_zoom_indices.clear();
        self.lowest_zoom = None;
        self.no_cache_next = true;
    }

    /// Returns true if the cache should repaint all tiles due to a zoom change
    /// that has settled for the debounce duration.
    pub fn should_repaint_all(&self) -> bool {
        self.zoom_changed_at
            .map(|t| t.elapsed() >= CACHE_DEBOUNCE_BY_ZOOM)
            .unwrap_or(false)
    }

    /// Returns true if a full repaint is required to refresh tiles
    pub fn should_use_cache_next(&self) -> bool {
        !self.no_cache_next
    }

    /// Mark that the pending full repaint request has been handled
    pub fn reset_full_repaint(&mut self) {
        self.no_cache_next = false;
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
            if zoom > self.max_zoom_for_cache {
                // Disable caching when sufficiently zoomed in - picture mode
                // is fast enough at this scale.
                self.clear();
                self.zoom_changed_at = None;
            } else {
                // Mark tiles as outdated so they are refreshed after debounce.
                // Note: lowest_zoom_indices are preserved
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
        if zoom > self.max_zoom_for_cache {
            // Caching disabled when zoomed in beyond the threshold
            self.clear();
            self.zoom_changed_at = None;
            return;
        }

        let world_size = self.tile_size as f32 / zoom;
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

                    // Check if we should update lowest zoom tracking
                    let should_update_lowest_zoom = if let Some(current_lowest) = self.lowest_zoom {
                        if zoom < current_lowest {
                            // New lower zoom level found, clear previous lowest zoom indices
                            self.lowest_zoom_indices.clear();
                            true
                        } else if (zoom - current_lowest).abs() < f32::EPSILON {
                            // Same zoom level, add to lowest zoom indices
                            true
                        } else {
                            // Higher zoom level, don't update lowest zoom tracking
                            false
                        }
                    } else {
                        // No lowest zoom set yet, this becomes the lowest
                        true
                    };

                    if should_update_lowest_zoom {
                        self.lowest_zoom = Some(zoom);
                        self.lowest_zoom_indices.insert(key);
                    }

                    // Always update regular tiles if they don't exist or if we have a higher zoom (better quality)
                    let should_update_tile = if let Some(existing_tile) = self.tiles.get(&key) {
                        // Update if the new tile has higher zoom (better quality)
                        zoom > existing_tile.zoom
                    } else {
                        // No existing tile, so add it
                        true
                    };

                    if should_update_tile {
                        if let Some(image) = surface.image_snapshot_with_bounds(IRect::from_xywh(
                            screen_rect.x as i32,
                            screen_rect.y as i32,
                            self.tile_size as i32,
                            self.tile_size as i32,
                        )) {
                            self.tiles.insert(
                                key,
                                TileAtZoom {
                                    image: Rc::new(image),
                                    zoom,
                                },
                            );
                        }
                    }
                }
            }
        }
        self.zoom_changed_at = None;
        self.no_cache_next = false;
    }

    /// Get tiles for a specific region with blur information and sorting.
    /// This encapsulates the logic for filtering tiles, calculating blur parameters,
    /// and sorting by quality for optimal rendering.
    pub fn get_region_tiles(&self, bounds: &Rectangle, current_zoom: f32) -> RegionTiles {
        RegionTiles::new(self, bounds, current_zoom)
    }
}
