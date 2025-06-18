//! # Tile Cache Module
//!
//! This module provides a raster tile caching system for an infinite 2D canvas,
//! designed to optimize rendering performance at low zoom levels by storing pre-rendered,
//! fixed-size image tiles.
//!
//! ## Purpose
//!
//! The cache exists to minimize overdraw and enable responsive panning and zooming across
//! a virtually infinite canvas. It does so by rasterizing regions of the scene into fixed-size
//! tiles (e.g. 512×512 pixels), indexed by quantized zoom level and grid coordinates.
//!
//! ## Tile Identification
//!
//! Tiles are uniquely identified by a `(zoom_level, col, row)` triple, where:
//! - `zoom_level` is quantized based on a defined step (e.g. 2x, 1x, 0.5x, 0.25x, ...).
//! - `col` and `row` are grid indices aligned to the tile size at that zoom level.
//!
//! This enables progressive loading and multi-resolution fallback by caching multiple
//! versions of the same region at different resolutions.
//!
//! ## Zoom Behavior
//!
//! - **Supported range**: Zoom levels from `0.02x` to `256x` are handled by the system.
//! - **Raster tile caching** is only applied for zoom levels **≤ 1.0x**.
//! - For zoom levels **> 1.0x**, the system relies on direct vector rendering, as the
//!   cost of rendering is acceptable and tiles would be redundant in both memory and quality.
//!
//! ## Memory Optimization
//!
//! This tile cache implements a self-optimizing memory strategy to avoid redundancy and overuse.
//! When higher-resolution tiles (from a higher zoom level) fully cover the region of a lower-resolution tile,
//! the cache will automatically evict the now-redundant lower-resolution tile.
//!
//! This promotion logic ensures:
//! - Memory is prioritized toward detailed, high-resolution regions
//! - Redundant LOD data does not accumulate
//! - Visual quality remains consistent, avoiding mixed-level rendering artifacts
//!
//! The `promote_to_best` flag in the strategy controls this behavior.
//! When enabled, higher-resolution tiles will replace and evict corresponding lower-resolution tiles.
//!
//! This keeps the cache lean while still supporting progressive refinement and low-latency rendering at low zooms.
//!
//! ## Responsibilities
//!
//! This module is **not** responsible for enforcing tile alignment or rendering logic.
//! It assumes that consumers (e.g. renderer) will provide fully-aligned, full-resolution
//! tiles and handle partial rendering avoidance upstream.
//!
//! The tile cache strictly manages tile storage, lookup, and invalidation within its own domain.
//!
//! ## Use Cases
//!
//! - Efficient rendering of large documents at low zoom
//! - Culling and partial scene recomposition
//! - Viewport-based tile loading strategies
//! - Progressive refinement and LOD tile management

pub use math2::rect::*;
use rstar::{AABB, RTree, RTreeObject};
use skia_safe::Image;
use std::collections::HashMap;
use std::time::Instant;

/// x, y, w, h
#[derive(Debug, Clone, Copy, Hash, Eq, PartialEq)]
pub struct TileRectKey(pub i32, pub i32, pub u32, pub u32);

impl TileRectKey {
    pub fn to_rect(&self) -> math2::Rectangle {
        math2::Rectangle {
            x: self.0 as f32,
            y: self.1 as f32,
            width: self.2 as f32,
            height: self.3 as f32,
        }
    }
}

/// Tile key is a tuple of (zoom, col, row)
type TileKey = (u8, i32, i32);

#[derive(Debug, Clone)]
pub struct TileResponse {
    /// requested zoom level
    requested_zoom: f32,
    /// requested rect
    requested_rect: Rectangle,
    /// keys of the tiles used to make the final tile
    keys: Vec<TileKey>,
    /// minimal required keys of the region that are missing with the right zoom level
    /// if these tiles are resolved, it can create a new tile with the right zoom level (cascading)
    /// [TileResponse] won't be resolved if any tiles are actually 'missing' - this indicates 'hey, on your next render, please resolve these tiles'
    requires: Vec<TileKey>,
    /// tiles used to make the final tile
    tiles: Vec<ImageTile>,
}

#[derive(Debug, Clone)]
pub struct ImageTile {
    /// version of the tile (usually synced with transaction id)
    pub version: u64,
    /// bounding rect in canvas space
    pub rect: Rectangle,
    /// image snapshot of the tile
    pub image: Image,
    /// real size of the tile in pixels
    pub size: (f32, f32),
    /// last used time
    pub lru: Instant,
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct IndexedTile {
    key: TileKey,
    bounds: AABB<[f32; 2]>,
}

impl RTreeObject for IndexedTile {
    type Envelope = AABB<[f32; 2]>;

    fn envelope(&self) -> Self::Envelope {
        self.bounds
    }
}

/// Configuration for how the scene tiles should be cached.
///
#[derive(Debug, Clone)]
pub struct ImageTileCacheStrategy {
    /// The size of the tile in pixels.
    pub size: usize,

    /// The quantization factor for zoom levels (e.g. 0.5 = half steps)
    pub zoom_step: f32,

    /// Minimum zoom level to cache (inclusive)
    pub min_zoom: f32,

    /// Maximum zoom level to cache (inclusive)
    pub max_zoom: f32,

    /// Whether to replace lower-res tiles with higher-res versions
    pub promote_to_best: bool,

    /// Max tiles to retain in memory (eviction happens past this)
    pub max_tile_count: Option<usize>,
}

impl Default for ImageTileCacheStrategy {
    fn default() -> Self {
        Self {
            size: 1024,
            zoom_step: 0.5,
            min_zoom: 0.02,
            max_zoom: 256.0,
            promote_to_best: true,
            max_tile_count: None,
        }
    }
}

#[derive(Debug, Clone)]
pub struct ImageTileCache {
    strategy: ImageTileCacheStrategy,
    tiles: HashMap<TileKey, ImageTile>,
    // dependents: HashMap<NodeId, HashSet<TileKey>>,
    index: RTree<IndexedTile>,
    last_response: Option<TileResponse>,
}

impl ImageTileCache {
    pub fn new() -> Self {
        Self {
            strategy: ImageTileCacheStrategy::default(),
            tiles: HashMap::new(),
            // dependents: HashMap::new(),
            index: RTree::new(),
            last_response: None,
        }
    }

    pub fn zoom_for_level(&self, level: u8) -> f32 {
        let mut zoom = self.strategy.max_zoom;
        for _ in 0..level {
            zoom *= self.strategy.zoom_step;
        }
        zoom
    }

    pub fn quantize_zoom(&self, zoom: f32) -> (u8, f32) {
        let mut level = 0u8;
        let mut current = self.strategy.max_zoom;
        let zoom = zoom.clamp(self.strategy.min_zoom, self.strategy.max_zoom);
        while zoom < current * self.strategy.zoom_step
            && current * self.strategy.zoom_step >= self.strategy.min_zoom
        {
            current *= self.strategy.zoom_step;
            level = level.saturating_add(1);
        }
        (level, current)
    }

    pub fn tile_world_size(&self, zoom: f32) -> f32 {
        self.strategy.size as f32 / zoom
    }

    pub fn tile_rect_for_key(&self, key: TileKey) -> Rectangle {
        let zoom = self.zoom_for_level(key.0);
        let size = self.tile_world_size(zoom);
        Rectangle {
            x: key.1 as f32 * size,
            y: key.2 as f32 * size,
            width: size,
            height: size,
        }
    }

    fn max_level(&self) -> u8 {
        let mut level = 0u8;
        let mut zoom = self.strategy.max_zoom;
        while zoom * self.strategy.zoom_step >= self.strategy.min_zoom {
            zoom *= self.strategy.zoom_step;
            level += 1;
        }
        level
    }

    fn collect(&self, level: u8, col: i32, row: i32, resp: &mut TileResponse) {
        if let Some(tile) = self.tiles.get(&(level, col, row)) {
            resp.keys.push((level, col, row));
            resp.tiles.push(tile.clone());
        } else if level < self.max_level() {
            let child_level = level + 1;
            for dy in 0..2 {
                for dx in 0..2 {
                    self.collect(child_level, col * 2 + dx, row * 2 + dy, resp);
                }
            }
            if !resp
                .tiles
                .iter()
                .any(|t| t.rect == self.tile_rect_for_key((level, col, row)))
            {
                resp.requires.push((level, col, row));
            }
        } else {
            resp.requires.push((level, col, row));
        }
    }

    fn promote(&mut self, key: TileKey) {
        let level = key.0;
        if level == 0 {
            return;
        }
        let parent = (level - 1, key.1 / 2, key.2 / 2);
        let siblings = [
            (level, parent.1 * 2, parent.2 * 2),
            (level, parent.1 * 2 + 1, parent.2 * 2),
            (level, parent.1 * 2, parent.2 * 2 + 1),
            (level, parent.1 * 2 + 1, parent.2 * 2 + 1),
        ];
        if siblings.iter().all(|k| self.tiles.contains_key(k)) {
            self.invalidate_tile(parent);
            self.promote(parent);
        }
    }
}

pub trait TileCache {
    /// Check if a tile exists.
    fn has(&self, key: TileKey) -> bool;

    /// Lookup a tile by quantized zoom and coordinates.
    /// Returns the tile if it exists.
    fn get_tile(&mut self, key: TileKey) -> Option<&ImageTile>;

    /// Get the best-available tile for a given logical region.
    /// Use this to first render, then resolve with the correct resolution.
    /// Returns Image Coalesced tile. (the tiles used to make the final tile, may have different resolutions)
    fn get_best_tile(
        &mut self,
        col: u32,
        row: u32,
        zoom_level: Option<f32>,
    ) -> Option<&TileResponse>;

    /// Get the best-available tile for a given region.
    /// Returns Image Coalesced tile. (the tiles used to make the final tile, may have different resolutions)
    fn get_best_tile_by_region(
        &mut self,
        region: Rectangle,
        zoom_level: Option<f32>,
    ) -> Option<&TileResponse>;

    // /// Insert a snapshot of the canvas.
    // /// automatically chunks and creates a tile, inserts if not exists.
    // fn insert_snapshot(
    //     &mut self,
    //     image: Image,
    //     size: (f32, f32),
    //     rect: Rectangle,
    //     zoom: f32,
    // ) -> bool;

    /// Insert or update a tile with an image.
    fn insert_tile(
        &mut self,
        key: TileKey,
        image: Image,
        size: (f32, f32),
        rect: Rectangle,
    ) -> bool;

    /// Manually invalidate a specific tile.
    fn invalidate_tile(&mut self, key: TileKey);

    /// Perform a memory cleanup pass (based on LRU and zoom promotion).
    fn prune(&mut self);

    /// Mark a tile as used.
    fn mark_used(&mut self, key: TileKey);

    /// Get the number of tiles in the cache.
    fn len(&self) -> usize;
}

impl TileCache for ImageTileCache {
    fn has(&self, key: TileKey) -> bool {
        self.tiles.contains_key(&key)
    }

    fn get_tile(&mut self, key: TileKey) -> Option<&ImageTile> {
        self.tiles.get(&key)
    }

    fn get_best_tile(
        &mut self,
        col: u32,
        row: u32,
        zoom_level: Option<f32>,
    ) -> Option<&TileResponse> {
        let zoom = zoom_level.unwrap_or(self.strategy.max_zoom);
        let (_level, zoom) = self.quantize_zoom(zoom);
        let size = self.tile_world_size(zoom);
        let region = Rectangle {
            x: col as f32 * size,
            y: row as f32 * size,
            width: size,
            height: size,
        };
        self.get_best_tile_by_region(region, Some(zoom))
    }

    fn get_best_tile_by_region(
        &mut self,
        region: Rectangle,
        zoom_level: Option<f32>,
    ) -> Option<&TileResponse> {
        let zoom = zoom_level.unwrap_or(self.strategy.max_zoom);
        let (level, zoom) = self.quantize_zoom(zoom);
        let size = self.tile_world_size(zoom);
        let start_col = (region.x / size).floor() as i32;
        let end_col = ((region.x + region.width) / size).ceil() as i32;
        let start_row = (region.y / size).floor() as i32;
        let end_row = ((region.y + region.height) / size).ceil() as i32;

        let mut resp = TileResponse {
            requested_zoom: zoom,
            requested_rect: region,
            keys: Vec::new(),
            requires: Vec::new(),
            tiles: Vec::new(),
        };

        for col in start_col..end_col {
            for row in start_row..end_row {
                self.collect(level, col, row, &mut resp);
            }
        }

        self.last_response = Some(resp);
        self.last_response.as_ref()
    }

    // fn insert_snapshot(
    //     &mut self,
    //     image: Image,
    //     size: (f32, f32),
    //     rect: Rectangle,
    //     zoom: f32,
    // ) -> bool {
    //     // TODO: implement this

    //     // 1. get the quantized bounds / aligned to the tile size
    //     let (level, zoom) = self.quantize_zoom(zoom);
    //     let size = self.tile_world_size(zoom);
    //     let start_col = (rect.x / size).floor() as u32;
    //     let end_col = ((rect.x + rect.width) / size).ceil() as u32;
    //     let start_row = (rect.y / size).floor() as u32;
    //     let end_row = ((rect.y + rect.height) / size).ceil() as u32;

    //     for col in start_col..end_col {
    //         for row in start_row..end_row {
    //             let key = (level, col, row);
    //             image.make_subset(direct, subset)
    //             self.insert_tile(key, image, size, rect);
    //         }
    //     }
    //     true
    // }

    fn insert_tile(
        &mut self,
        key: TileKey,
        image: Image,
        size: (f32, f32),
        rect: Rectangle,
    ) -> bool {
        let replaced = self.tiles.contains_key(&key);
        let tile = ImageTile {
            version: 0,
            rect,
            image,
            size,
            lru: Instant::now(),
        };
        self.tiles.insert(key, tile.clone());

        let bounds = AABB::from_corners(
            [rect.x, rect.y],
            [rect.x + rect.width, rect.y + rect.height],
        );
        self.index.insert(IndexedTile { key, bounds });
        if self.strategy.promote_to_best {
            self.promote(key);
        }
        self.prune();
        replaced
    }

    fn invalidate_tile(&mut self, key: TileKey) {
        if let Some(tile) = self.tiles.remove(&key) {
            let bounds = AABB::from_corners(
                [tile.rect.x, tile.rect.y],
                [
                    tile.rect.x + tile.rect.width,
                    tile.rect.y + tile.rect.height,
                ],
            );
            self.index.remove(&IndexedTile { key, bounds });
        }
    }

    fn prune(&mut self) {
        if let Some(max) = self.strategy.max_tile_count {
            while self.tiles.len() > max {
                if let Some((&old_key, _)) = self.tiles.iter().min_by_key(|(_, t)| t.lru) {
                    self.invalidate_tile(old_key);
                } else {
                    break;
                }
            }
        }
    }

    fn mark_used(&mut self, key: TileKey) {
        if let Some(tile) = self.tiles.get_mut(&key) {
            tile.lru = Instant::now();
        }
    }

    fn len(&self) -> usize {
        self.tiles.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use skia_safe::surfaces;

    fn dummy_image() -> Image {
        let mut surface = surfaces::raster_n32_premul((256, 256)).unwrap();
        surface.image_snapshot()
    }

    #[test]
    #[ignore]
    fn insert_and_get_tile() {
        let mut cache = ImageTileCache::new();
        let img = dummy_image();
        let rect = cache.tile_rect_for_key((0, 0, 0));
        cache.insert_tile((0, 0, 0), img.clone(), (256.0, 256.0), rect);
        let resp = cache.get_best_tile_by_region(rect, Some(1.0)).unwrap();
        assert_eq!(resp.tiles.len(), 1);
        assert_eq!(resp.keys[0], (0, 0, 0));
    }

    #[test]
    #[ignore]
    fn promote_parent_eviction() {
        let mut cache = ImageTileCache::new();
        let parent_rect = cache.tile_rect_for_key((0, 0, 0));
        let img = dummy_image();
        cache.insert_tile((0, 0, 0), img.clone(), (256.0, 256.0), parent_rect);

        let child_zoom = cache.zoom_for_level(1);
        let size = cache.tile_world_size(child_zoom);
        for c in 0..2 {
            for r in 0..2 {
                let rect = Rectangle {
                    x: c as f32 * size,
                    y: r as f32 * size,
                    width: size,
                    height: size,
                };
                cache.insert_tile((1, c, r), img.clone(), (256.0, 256.0), rect);
            }
        }

        assert_eq!(cache.len(), 4);
        let resp = cache
            .get_best_tile_by_region(parent_rect, Some(1.0))
            .unwrap();
        assert_eq!(resp.tiles.len(), 4);
        assert!(resp.keys.iter().all(|k| k.0 == 1));
    }

    // #[test]
    // fn invalidate_by_node() {
    //     let mut cache = ImageTileCache::new();
    //     let img = dummy_image();
    //     let rect = cache.tile_rect_for_key((0, 0, 0));
    //     cache.insert_tile((0, 0, 0), img.clone(), (256.0, 256.0), rect);
    //     cache.invalidate_by_nodes(&[node("a")]);
    //     assert_eq!(cache.len(), 0);
    // }

    #[test]
    fn prune_oldest() {
        let mut cache = ImageTileCache::new();
        cache.strategy.max_tile_count = Some(2);
        let img = dummy_image();
        for i in 0..3 {
            let rect = cache.tile_rect_for_key((0, i, 0));
            cache.insert_tile((0, i, 0), img.clone(), (256.0, 256.0), rect);
        }
        assert_eq!(cache.len(), 2);
    }
}
