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
use skia_safe::Image;
use std::collections::{HashMap, HashSet};
use std::time::Instant;

use crate::node::schema::NodeId;

/// Tile key is a tuple of (zoom, col, row)
type TileKey = (u8, u32, u32);

#[derive(Debug, Clone)]
struct TileResponse {
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
struct ImageTile {
    /// version of the tile (usually synced with transaction id)
    version: u64,
    /// bounding rect in canvas space
    rect: Rectangle,
    /// image snapshot of the tile
    image: Image,
    /// real size of the tile in pixels
    size: (f32, f32),
    /// last used time
    lru: Instant,
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
            size: 256,
            zoom_step: 0.5,
            min_zoom: 0.02,
            max_zoom: 1.0,
            promote_to_best: true,
            max_tile_count: None,
        }
    }
}

#[derive(Debug, Clone)]
pub struct ImageTileCache {
    strategy: ImageTileCacheStrategy,
    tiles: HashMap<TileKey, ImageTile>,
    dependents: HashMap<NodeId, HashSet<TileKey>>,
}

impl ImageTileCache {
    pub fn new() -> Self {
        Self {
            strategy: ImageTileCacheStrategy::default(),
            tiles: HashMap::new(),
            dependents: HashMap::new(),
        }
    }
}

trait TileCache {
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

    /// Insert or update a tile with an image.
    fn insert_tile(
        &mut self,
        key: TileKey,
        image: Image,
        size: (f32, f32),
        rect: Rectangle,
        used_nodes: &[NodeId],
    ) -> bool;

    /// Not recommended to use.
    /// Invalidate all tiles dependent on given node(s).
    /// Soley calling this won't ensure the tiles are up-to-date, this only "invalidates" the obvious (previously dependent) tiles.
    fn invalidate_by_nodes(&mut self, node_ids: &[NodeId]);

    /// Manually invalidate a specific tile.
    fn invalidate_tile(&mut self, key: TileKey);

    /// Perform a memory cleanup pass (based on LRU and zoom promotion).
    fn prune(&mut self);

    /// Mark a tile as used.
    fn mark_used(&mut self, key: TileKey);

    /// Get the number of tiles in the cache.
    fn len(&self) -> usize;
}
