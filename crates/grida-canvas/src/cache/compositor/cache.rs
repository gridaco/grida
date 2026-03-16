//! Per-node layer image cache.
//!
//! Each promoted node gets metadata tracked here. The actual pixel data
//! is sourced either from an individual `SkImage` (fallback) or from a
//! sub-rect of a shared texture atlas (batch-friendly compositing).

use crate::cg::prelude::LayerBlendMode;
use crate::node::schema::NodeId;
use math2::rect::Rectangle;
use skia_safe::Image;
use std::collections::HashMap;
use std::rc::Rc;

/// Where a promoted node's cached pixels live.
#[derive(Debug, Clone)]
pub enum ImageSource {
    /// Individual GPU texture (one per node). Fallback when the atlas
    /// is full or the node is too large.
    Individual(Rc<Image>),
    /// Pixels live in a texture atlas page. The blit loop reads the
    /// atlas image via `AtlasSet::get_image_and_src_rect()`.
    /// No `Image` reference stored here — the atlas owns the surface.
    Atlas,
}

/// Metadata and pixel source for a single promoted node.
#[derive(Debug, Clone)]
pub struct LayerImage {
    /// Where the cached pixels live.
    pub source: ImageSource,
    /// Zoom level at which this image was captured.
    pub zoom: f32,
    /// Bounds in world coordinates (includes effect expansion).
    /// The image pixels cover exactly this rectangle at the captured zoom.
    pub local_bounds: Rectangle,
    /// Width of the cached image in pixels.
    pub pixel_width: u32,
    /// Height of the cached image in pixels.
    pub pixel_height: u32,
    /// Opacity at capture time (baked into blit paint).
    pub opacity: f32,
    /// Blend mode at capture time (baked into blit paint).
    pub blend_mode: LayerBlendMode,
    /// Frame number when this image was last used (for LRU eviction).
    pub last_used_frame: u64,
    /// Whether this image needs re-rasterization (content changed).
    pub dirty: bool,
}

impl LayerImage {
    /// Estimated memory usage in bytes (width * height * 4 for RGBA).
    /// Atlas-backed entries return 0 — the atlas page owns the memory.
    pub fn estimated_bytes(&self) -> usize {
        match &self.source {
            ImageSource::Individual(_) => (self.pixel_width as usize) * (self.pixel_height as usize) * 4,
            ImageSource::Atlas => 0,
        }
    }

    /// Returns the individual image, if this entry uses one.
    pub fn individual_image(&self) -> Option<&Rc<Image>> {
        match &self.source {
            ImageSource::Individual(img) => Some(img),
            ImageSource::Atlas => None,
        }
    }

    /// Whether this entry's pixels are stored in the texture atlas.
    pub fn is_atlas_backed(&self) -> bool {
        matches!(&self.source, ImageSource::Atlas)
    }
}

/// Statistics about the layer image cache state.
#[derive(Debug, Clone, Copy, Default)]
pub struct LayerImageCacheStats {
    /// Total number of promoted nodes.
    pub promoted_count: usize,
    /// Number of cache hits this frame.
    pub hits: usize,
    /// Estimated total memory in bytes (individual images only).
    pub memory_bytes: usize,
    /// Number of dirty (pending re-rasterization) entries.
    pub dirty_count: usize,
    /// Number of atlas-backed entries.
    pub atlas_backed: usize,
    /// Number of individually-backed entries.
    pub individual_backed: usize,
}

/// Per-node layer image cache.
///
/// Maps `NodeId` → `LayerImage`. Nodes that pass the promotion heuristic
/// get rasterized and their metadata stored here. The actual pixel data
/// may live in an individual `SkImage` or in a shared texture atlas —
/// the [`ImageSource`] enum tracks which.
#[derive(Debug, Clone)]
pub struct LayerImageCache {
    /// Promoted node entries, keyed by node ID.
    images: HashMap<NodeId, LayerImage>,
    /// Maximum memory budget in bytes (default: 128 MB).
    /// Only individual (non-atlas) images count against this budget.
    memory_budget: usize,
    /// Current estimated memory usage in bytes (individual images only).
    memory_used: usize,
    /// Current frame number (for LRU tracking).
    frame_counter: u64,
}

/// Default memory budget: 128 MB.
const DEFAULT_MEMORY_BUDGET: usize = 128 * 1024 * 1024;

impl Default for LayerImageCache {
    fn default() -> Self {
        Self::new(DEFAULT_MEMORY_BUDGET)
    }
}

impl LayerImageCache {
    /// Create a new layer image cache with the given memory budget.
    pub fn new(memory_budget: usize) -> Self {
        Self {
            images: HashMap::new(),
            memory_budget,
            memory_used: 0,
            frame_counter: 0,
        }
    }

    /// Get a cached layer image for a node, if it exists and is not dirty.
    ///
    /// Also updates the `last_used_frame` for LRU tracking.
    pub fn get(&mut self, id: &NodeId) -> Option<&LayerImage> {
        let frame = self.frame_counter;
        if let Some(entry) = self.images.get_mut(id) {
            if !entry.dirty {
                entry.last_used_frame = frame;
                return Some(entry);
            }
        }
        None
    }

    /// Get a cached layer image without updating LRU (read-only peek).
    pub fn peek(&self, id: &NodeId) -> Option<&LayerImage> {
        self.images.get(id).filter(|e| !e.dirty)
    }

    /// Insert or update a cached image for a node (individual texture).
    ///
    /// If the cache is over budget after insertion, LRU eviction is triggered.
    pub fn insert(
        &mut self,
        id: NodeId,
        image: Image,
        zoom: f32,
        bounds: Rectangle,
        opacity: f32,
        blend_mode: LayerBlendMode,
    ) {
        let pw = image.width() as u32;
        let ph = image.height() as u32;
        let new_bytes = (pw as usize) * (ph as usize) * 4;

        // Remove old entry's memory contribution if it exists.
        if let Some(old) = self.images.get(&id) {
            self.memory_used = self.memory_used.saturating_sub(old.estimated_bytes());
        }

        self.images.insert(
            id,
            LayerImage {
                source: ImageSource::Individual(Rc::new(image)),
                zoom,
                local_bounds: bounds,
                pixel_width: pw,
                pixel_height: ph,
                opacity,
                blend_mode,
                last_used_frame: self.frame_counter,
                dirty: false,
            },
        );

        self.memory_used += new_bytes;

        // Evict if over budget.
        if self.memory_used > self.memory_budget {
            self.evict_lru();
        }
    }

    /// Insert or update metadata for an atlas-backed node.
    ///
    /// The actual pixels live in the texture atlas — this entry only tracks
    /// metadata (zoom, bounds, opacity, blend mode, dirty state).
    /// Atlas entries do not count against the memory budget.
    pub fn insert_atlas(
        &mut self,
        id: NodeId,
        pixel_width: u32,
        pixel_height: u32,
        zoom: f32,
        bounds: Rectangle,
        opacity: f32,
        blend_mode: LayerBlendMode,
    ) {
        // Remove old entry's memory contribution if it was individual.
        if let Some(old) = self.images.get(&id) {
            self.memory_used = self.memory_used.saturating_sub(old.estimated_bytes());
        }

        self.images.insert(
            id,
            LayerImage {
                source: ImageSource::Atlas,
                zoom,
                local_bounds: bounds,
                pixel_width,
                pixel_height,
                opacity,
                blend_mode,
                last_used_frame: self.frame_counter,
                dirty: false,
            },
        );
    }

    /// Mark a specific node's cached image as dirty (needs re-rasterization).
    /// The entry is NOT removed — it can still serve as a stale fallback
    /// during the frame where it's being re-rasterized.
    pub fn invalidate(&mut self, id: &NodeId) {
        if let Some(entry) = self.images.get_mut(id) {
            entry.dirty = true;
        }
    }

    /// Mark all cached images as dirty (e.g. on zoom change).
    pub fn invalidate_all(&mut self) {
        for entry in self.images.values_mut() {
            entry.dirty = true;
        }
    }

    /// Remove a specific node's cached image entirely.
    pub fn remove(&mut self, id: &NodeId) {
        if let Some(removed) = self.images.remove(id) {
            self.memory_used = self.memory_used.saturating_sub(removed.estimated_bytes());
        }
    }

    /// Remove all cached images.
    pub fn clear(&mut self) {
        self.images.clear();
        self.memory_used = 0;
    }

    /// Evict least-recently-used entries until memory is under budget.
    /// Only individual (budgeted) entries are considered for eviction —
    /// atlas-backed entries report 0 bytes and evicting them would not
    /// reduce `memory_used`.
    pub fn evict_lru(&mut self) {
        while self.memory_used > self.memory_budget {
            // Find the budgeted entry with the smallest last_used_frame.
            let lru_id = self
                .images
                .iter()
                .filter(|(_, entry)| entry.estimated_bytes() > 0)
                .min_by_key(|(_, entry)| entry.last_used_frame)
                .map(|(id, _)| *id);

            if let Some(id) = lru_id {
                self.remove(&id);
            } else {
                break; // No budgeted entries left to evict.
            }
        }
    }

    /// Increment the frame counter. Call once per frame.
    pub fn tick_frame(&mut self) {
        self.frame_counter += 1;
    }

    /// Current estimated memory usage in bytes.
    pub fn memory_used(&self) -> usize {
        self.memory_used
    }

    /// Maximum memory budget in bytes.
    pub fn memory_budget(&self) -> usize {
        self.memory_budget
    }

    /// Number of promoted nodes currently cached.
    pub fn len(&self) -> usize {
        self.images.len()
    }

    /// Whether the cache is empty.
    pub fn is_empty(&self) -> bool {
        self.images.is_empty()
    }

    /// Current frame counter value.
    pub fn frame_counter(&self) -> u64 {
        self.frame_counter
    }

    /// Whether there is remaining memory budget for new entries.
    pub fn has_budget(&self) -> bool {
        self.memory_used < self.memory_budget
    }

    /// Returns true when there are dirty entries that need re-rasterization.
    pub fn has_dirty(&self) -> bool {
        self.images.values().any(|e| e.dirty)
    }

    /// Collect cache statistics.
    pub fn stats(&self) -> LayerImageCacheStats {
        let mut atlas_backed = 0usize;
        let mut individual_backed = 0usize;
        for entry in self.images.values() {
            match &entry.source {
                ImageSource::Atlas => atlas_backed += 1,
                ImageSource::Individual(_) => individual_backed += 1,
            }
        }
        LayerImageCacheStats {
            promoted_count: self.images.len(),
            hits: 0,
            memory_bytes: self.memory_used,
            dirty_count: self.images.values().filter(|e| e.dirty).count(),
            atlas_backed,
            individual_backed,
        }
    }

    /// Iterate over all cached entries.
    pub fn iter(&self) -> impl Iterator<Item = (&NodeId, &LayerImage)> {
        self.images.iter()
    }

    /// Iterate over all dirty entries that need re-rasterization.
    pub fn dirty_entries(&self) -> impl Iterator<Item = (&NodeId, &LayerImage)> {
        self.images.iter().filter(|(_, e)| e.dirty)
    }

    /// Check if a node is currently promoted (has a cache entry, dirty or not).
    pub fn is_promoted(&self, id: &NodeId) -> bool {
        self.images.contains_key(id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_test_image(w: i32, h: i32) -> Image {
        use skia_safe::surfaces;
        let mut surface =
            surfaces::raster_n32_premul((w, h)).expect("Failed to create test surface");
        surface.image_snapshot()
    }

    fn default_blend() -> LayerBlendMode {
        LayerBlendMode::default()
    }

    fn insert_test(cache: &mut LayerImageCache, id: NodeId, img: Image, zoom: f32, bounds: Rectangle) {
        cache.insert(id, img, zoom, bounds, 1.0, default_blend());
    }

    fn zero_rect() -> Rectangle {
        Rectangle { x: 0.0, y: 0.0, width: 0.0, height: 0.0 }
    }

    #[test]
    fn insert_and_get() {
        let mut cache = LayerImageCache::new(1024 * 1024);
        let id: NodeId = 42;
        let img = make_test_image(10, 10);
        let bounds = Rectangle { x: 0.0, y: 0.0, width: 10.0, height: 10.0 };
        insert_test(&mut cache, id, img, 1.0, bounds);

        assert_eq!(cache.len(), 1);
        assert!(cache.get(&id).is_some());
        assert_eq!(cache.memory_used(), 10 * 10 * 4);
    }

    #[test]
    fn invalidate_makes_get_return_none() {
        let mut cache = LayerImageCache::new(1024 * 1024);
        let id: NodeId = 1;
        insert_test(&mut cache, id, make_test_image(5, 5), 1.0, zero_rect());
        cache.invalidate(&id);
        assert!(cache.get(&id).is_none());
        assert!(cache.is_promoted(&id));
    }

    #[test]
    fn lru_eviction() {
        let mut cache = LayerImageCache::new(400);
        let bounds = zero_rect();
        insert_test(&mut cache, 1, make_test_image(10, 10), 1.0, bounds);
        assert_eq!(cache.len(), 1);
        cache.tick_frame();
        insert_test(&mut cache, 2, make_test_image(10, 10), 1.0, bounds);
        assert_eq!(cache.len(), 1);
        assert!(!cache.is_promoted(&1));
        assert!(cache.is_promoted(&2));
    }

    #[test]
    fn invalidate_all() {
        let mut cache = LayerImageCache::new(1024 * 1024);
        let bounds = zero_rect();
        insert_test(&mut cache, 1, make_test_image(5, 5), 1.0, bounds);
        insert_test(&mut cache, 2, make_test_image(5, 5), 1.0, bounds);
        cache.invalidate_all();
        assert!(cache.get(&1).is_none());
        assert!(cache.get(&2).is_none());
        assert_eq!(cache.stats().dirty_count, 2);
    }

    #[test]
    fn remove_updates_memory() {
        let mut cache = LayerImageCache::new(1024 * 1024);
        insert_test(&mut cache, 1, make_test_image(10, 10), 1.0, zero_rect());
        assert_eq!(cache.memory_used(), 400);
        cache.remove(&1);
        assert_eq!(cache.memory_used(), 0);
        assert_eq!(cache.len(), 0);
    }

    #[test]
    fn clear_resets_everything() {
        let mut cache = LayerImageCache::new(1024 * 1024);
        let bounds = zero_rect();
        insert_test(&mut cache, 1, make_test_image(5, 5), 1.0, bounds);
        insert_test(&mut cache, 2, make_test_image(5, 5), 1.0, bounds);
        cache.clear();
        assert_eq!(cache.len(), 0);
        assert_eq!(cache.memory_used(), 0);
    }

    #[test]
    fn atlas_backed_entry() {
        let mut cache = LayerImageCache::new(1024 * 1024);
        let bounds = Rectangle { x: 10.0, y: 20.0, width: 100.0, height: 80.0 };
        cache.insert_atlas(42, 100, 80, 1.0, bounds, 0.8, default_blend());

        assert_eq!(cache.len(), 1);
        // Atlas entries don't count against memory budget.
        assert_eq!(cache.memory_used(), 0);

        let entry = cache.get(&42).unwrap();
        assert!(entry.is_atlas_backed());
        assert!(entry.individual_image().is_none());
        assert_eq!(entry.pixel_width, 100);
        assert_eq!(entry.pixel_height, 80);
        assert_eq!(entry.opacity, 0.8);
    }

    #[test]
    fn stats_tracks_source_types() {
        let mut cache = LayerImageCache::new(1024 * 1024);
        let bounds = zero_rect();
        insert_test(&mut cache, 1, make_test_image(5, 5), 1.0, bounds);
        cache.insert_atlas(2, 50, 50, 1.0, bounds, 1.0, default_blend());

        let stats = cache.stats();
        assert_eq!(stats.promoted_count, 2);
        assert_eq!(stats.individual_backed, 1);
        assert_eq!(stats.atlas_backed, 1);
    }

    #[test]
    fn atlas_replaces_individual() {
        let mut cache = LayerImageCache::new(1024 * 1024);
        let bounds = zero_rect();
        insert_test(&mut cache, 1, make_test_image(10, 10), 1.0, bounds);
        assert_eq!(cache.memory_used(), 400);

        // Replace with atlas-backed entry.
        cache.insert_atlas(1, 10, 10, 1.0, bounds, 1.0, default_blend());
        // Memory freed since atlas doesn't count.
        assert_eq!(cache.memory_used(), 0);
        assert!(cache.get(&1).unwrap().is_atlas_backed());
    }
}
