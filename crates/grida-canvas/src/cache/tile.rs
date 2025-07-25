use crate::runtime::camera::Camera2D;
use math2::rect::{self, Rectangle};
use skia_safe::{IRect, Image, Surface};
use std::collections::HashMap;
use std::rc::Rc;

/// The resolution strategy to use for the image tile cache.
pub enum ImageTileCacheResolutionStrategy {
    /// only use matching tiles
    Exact,
    /// only use matching tiles (exact or higher)
    Default,
    /// forces to use the cache even for invalid regions
    ForceCache,
}
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
    /// the image of the tile
    pub image: Rc<Image>,
    /// the zoom level at which this tile was snapshotted
    pub zoom: f32,
    /// captured world rect of the tile. may be smaller than tile key
    pub rect: Rectangle,
    /// if the tile is partial capture of the edge.
    pub partial: bool,
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
    /// actual world rect captured for this tile
    pub rect: Rectangle,
    // TODO:
    // The clip rects (region path) should be applied to this tile.
    // this is required as the upper tiles can have opaque, and the lower tiles should be clipped to prevent them from flooding.
    // we use clip since cropping the image can be expensive.
    // pub clippath: Option<Path>,
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
    pub fn empty() -> Self {
        Self {
            tiles: Vec::new(),
            tile_rects: Vec::new(),
        }
    }

    /// Determines if a tile should be included based on the resolution strategy.
    fn should_include_tile(
        strategy: &ImageTileCacheResolutionStrategy,
        tile_at_zoom: Option<&TileAtZoom>,
        current_zoom: f32,
    ) -> bool {
        match strategy {
            ImageTileCacheResolutionStrategy::Exact => {
                if let Some(tile) = tile_at_zoom {
                    (tile.zoom - current_zoom).abs() < f32::EPSILON
                } else {
                    false
                }
            }
            ImageTileCacheResolutionStrategy::Default => {
                if let Some(tile) = tile_at_zoom {
                    tile.zoom >= current_zoom
                } else {
                    false
                }
            }
            ImageTileCacheResolutionStrategy::ForceCache => tile_at_zoom.is_some(),
        }
    }

    /// Create a new RegionTiles instance with tiles filtered from the cache
    /// for the given bounds and current zoom level.
    pub fn new(
        cache: &ImageTileCache,
        bounds: &Rectangle,
        current_zoom: f32,
        strategy: ImageTileCacheResolutionStrategy,
    ) -> Self {
        let mut tiles: Vec<RegionTileInfo> = Vec::new();
        let mut tile_rects: Vec<Rectangle> = Vec::new();

        const BLUR_SCALE: f32 = 1.0;
        const MAX_BLUR_RADIUS: f32 = 8.0;

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

            // Apply strategy-based filtering
            let should_include = Self::should_include_tile(&strategy, tile_at_zoom, current_zoom);

            if should_include {
                let rect = tile_at_zoom
                    .map(|t| t.rect)
                    .unwrap_or_else(|| key.to_rect());
                tiles.push(RegionTileInfo {
                    key: *key,
                    blur: should_blur,
                    blur_radius,
                    zoom: tile_zoom,
                    rect,
                });
                tile_rects.push(rect);
            }
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
    prev_zoom: Option<f32>,
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
    /// Caching is enabled while the camera zoom is at or below this level.
    /// When zooming in beyond this value the cache is cleared and disabled
    /// as the picture based rendering is fast enough.
    pub max_zoom_for_cache: f32,
}

impl Default for ImageTileCache {
    fn default() -> Self {
        Self {
            tile_size: 512,
            tiles: HashMap::new(),
            prev_zoom: None,
            lowest_zoom: None,
            lowest_zoom_indices: std::collections::HashSet::new(),
            max_zoom_for_cache: 2.0,
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
            prev_zoom: None,
            lowest_zoom: None,
            lowest_zoom_indices: std::collections::HashSet::new(),
            max_zoom_for_cache: 2.0,
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
    }

    /// Remove all tiles including lowest zoom tiles.
    pub fn clear_all(&mut self) {
        self.tiles.clear();
        self.lowest_zoom_indices.clear();
        self.lowest_zoom = None;
    }

    /// Capture visible region tiles from the provided surface.
    pub fn update_tiles<F>(
        &mut self,
        camera: &Camera2D,
        width: f32,
        height: f32,
        surface: &mut Surface,
        partial: bool,
        mut intersects: F,
    ) where
        F: FnMut(Rectangle) -> bool,
    {
        let zoom = camera.get_zoom();
        if zoom > self.max_zoom_for_cache {
            return;
        }

        if let Some(prev_zoom) = self.prev_zoom {
            if (prev_zoom - zoom).abs() < f32::EPSILON {
                self.clear();
            }
        }
        self.prev_zoom = Some(zoom);

        let world_size = self.tile_size as f32 / zoom;
        let rect = camera.rect();

        let screen_bounds = Rectangle {
            x: 0.0,
            y: 0.0,
            width,
            height,
        };

        for (col, row) in self.tile_indices(&rect, world_size) {
            let world_rect = self.tile_world_rect(col, row, world_size);

            if !intersects(world_rect) {
                continue;
            }

            let screen_rect = rect::transform(world_rect, &camera.view_matrix());
            let visible = if partial {
                rect::intersects(&screen_rect, &screen_bounds)
            } else {
                self.is_tile_visible(&screen_rect, width, height)
            };
            if !visible {
                continue;
            }

            let key = self.tile_key(&world_rect);
            self.update_lowest_zoom_tracking(&key, zoom);

            let capture_world_rect = if partial {
                world_rect
                    .intersection(&camera.rect())
                    .unwrap_or(world_rect)
            } else {
                world_rect
            };

            if self.should_update_tile(&key, zoom) {
                self.capture_tile(
                    surface,
                    &screen_rect,
                    key,
                    zoom,
                    capture_world_rect,
                    partial,
                );
            }
        }
    }

    /// Generate tile indices for the given camera rect and world size
    fn tile_indices(&self, rect: &Rectangle, world_size: f32) -> impl Iterator<Item = (i32, i32)> {
        let start_col = (rect.x / world_size).floor() as i32;
        let end_col = ((rect.x + rect.width) / world_size).ceil() as i32;
        let start_row = (rect.y / world_size).floor() as i32;
        let end_row = ((rect.y + rect.height) / world_size).ceil() as i32;

        (start_col..end_col).flat_map(move |col| (start_row..end_row).map(move |row| (col, row)))
    }

    /// Create world rectangle for a tile at given column and row
    fn tile_world_rect(&self, col: i32, row: i32, world_size: f32) -> Rectangle {
        Rectangle {
            x: col as f32 * world_size,
            y: row as f32 * world_size,
            width: world_size,
            height: world_size,
        }
    }

    /// Check if a tile is fully visible on screen
    fn is_tile_visible(&self, screen_rect: &Rectangle, width: f32, height: f32) -> bool {
        screen_rect.x >= 0.0
            && screen_rect.y >= 0.0
            && screen_rect.x + screen_rect.width <= width
            && screen_rect.y + screen_rect.height <= height
    }

    /// Create tile key from world rectangle
    fn tile_key(&self, world_rect: &Rectangle) -> TileRectKey {
        TileRectKey(
            world_rect.x.round() as i32,
            world_rect.y.round() as i32,
            world_rect.width.round() as u32,
            world_rect.height.round() as u32,
        )
    }

    /// Update lowest zoom tracking for the given tile key
    fn update_lowest_zoom_tracking(&mut self, key: &TileRectKey, zoom: f32) {
        let should_update = match self.lowest_zoom {
            Some(current_lowest) => {
                if zoom < current_lowest {
                    self.lowest_zoom_indices.clear();
                    true
                } else if (zoom - current_lowest).abs() < f32::EPSILON {
                    true
                } else {
                    false
                }
            }
            None => true,
        };

        if should_update {
            self.lowest_zoom = Some(zoom);
            self.lowest_zoom_indices.insert(*key);
        }
    }

    /// Check if a tile should be updated based on zoom level
    fn should_update_tile(&self, key: &TileRectKey, zoom: f32) -> bool {
        self.tiles
            .get(key)
            .map(|existing_tile| existing_tile.partial || zoom > existing_tile.zoom)
            .unwrap_or(true)
    }

    /// Capture a tile from the surface and store it in the cache
    fn capture_tile(
        &mut self,
        surface: &mut Surface,
        screen_rect: &Rectangle,
        key: TileRectKey,
        zoom: f32,
        world_rect: Rectangle,
        partial: bool,
    ) {
        let rect = if partial {
            let bounds = Rectangle {
                x: 0.0,
                y: 0.0,
                width: surface.width() as f32,
                height: surface.height() as f32,
            };
            if let Some(int) = screen_rect.intersection(&bounds) {
                int
            } else {
                *screen_rect
            }
        } else {
            *screen_rect
        };

        if let Some(image) = surface.image_snapshot_with_bounds(IRect::from_xywh(
            rect.x as i32,
            rect.y as i32,
            rect.width as i32,
            rect.height as i32,
        )) {
            self.tiles.insert(
                key,
                TileAtZoom {
                    image: Rc::new(image),
                    zoom,
                    rect: world_rect,
                    partial,
                },
            );
        }
    }

    /// Get tiles for a specific region with blur information and sorting.
    /// This encapsulates the logic for filtering tiles, calculating blur parameters,
    /// and sorting by quality for optimal rendering.
    pub fn get_region_tiles(
        &self,
        bounds: &Rectangle,
        current_zoom: f32,
        strategy: ImageTileCacheResolutionStrategy,
    ) -> RegionTiles {
        if current_zoom > self.max_zoom_for_cache {
            return RegionTiles::empty();
        }
        RegionTiles::new(self, bounds, current_zoom, strategy)
    }
}
