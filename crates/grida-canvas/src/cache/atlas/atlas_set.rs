//! Multi-page atlas set.
//!
//! Manages multiple [`AtlasPage`]s with overflow. When a node doesn't fit
//! on any existing page, a new page is created (up to a configurable
//! maximum).

use super::atlas::{AtlasAllocation, AtlasPage};
use crate::node::schema::NodeId;
use skia_safe::{Image, Surface};
use std::collections::HashMap;

/// Configuration for an atlas set.
#[derive(Debug, Clone, Copy)]
pub struct AtlasSetConfig {
    /// Width of each atlas page in pixels.
    pub page_width: u32,
    /// Height of each atlas page in pixels.
    pub page_height: u32,
    /// Maximum number of atlas pages allowed.
    pub max_pages: u32,
}

impl Default for AtlasSetConfig {
    fn default() -> Self {
        Self {
            page_width: 4096,
            page_height: 4096,
            max_pages: 8,
        }
    }
}

/// Statistics for the entire atlas set.
#[derive(Debug, Clone, Copy, Default)]
pub struct AtlasSetStats {
    /// Number of active pages.
    pub page_count: u32,
    /// Total nodes across all pages.
    pub total_nodes: u32,
    /// Total used area across all pages (pixels).
    pub total_used_area: u64,
    /// Total atlas area across all pages (pixels).
    pub total_atlas_area: u64,
    /// Overall packing efficiency.
    pub efficiency: f32,
}

/// Manages multiple atlas pages.
///
/// Nodes are allocated to pages using a first-fit strategy. When no
/// existing page has room, a new page is created. A factory function
/// is used to create GPU surfaces for new pages.
pub struct AtlasSet {
    config: AtlasSetConfig,
    pages: Vec<AtlasPage>,
    /// Map from node ID to the page index it's allocated on.
    node_page: HashMap<NodeId, u32>,
}

impl AtlasSet {
    /// Create a new atlas set with the given configuration.
    ///
    /// Pages are created lazily — the set starts empty.
    pub fn new(config: AtlasSetConfig) -> Self {
        Self {
            config,
            pages: Vec::new(),
            node_page: HashMap::new(),
        }
    }

    /// Allocate a slot for a node.
    ///
    /// Tries each existing page in order. If none have room, creates a
    /// new page using `create_surface`. Returns `None` if the node is
    /// too large for a single page or the maximum page count is reached.
    ///
    /// `create_surface` is called only when a new page is needed. It
    /// receives `(page_width, page_height)` and must return a GPU-backed
    /// `Surface`.
    pub fn allocate(
        &mut self,
        node_id: NodeId,
        width: u32,
        height: u32,
        create_surface: impl FnOnce(u32, u32) -> Option<Surface>,
    ) -> Option<AtlasAllocation> {
        // If this node already exists, free it first.
        self.free_node(&node_id);

        // Try existing pages.
        for page in &mut self.pages {
            if let Some(alloc) = page.allocate(node_id, width, height) {
                self.node_page.insert(node_id, alloc.page_index);
                return Some(alloc);
            }
        }

        // No room — create a new page if under the limit.
        if self.pages.len() as u32 >= self.config.max_pages {
            return None;
        }

        // Check if the node can fit in a page at all.
        if width > self.config.page_width || height > self.config.page_height {
            return None;
        }

        let page_index = self.pages.len() as u32;
        let surface = create_surface(self.config.page_width, self.config.page_height)?;
        let mut page = AtlasPage::new(surface, page_index);
        let alloc = page.allocate(node_id, width, height)?;
        self.pages.push(page);
        self.node_page.insert(node_id, alloc.page_index);
        Some(alloc)
    }

    /// Free a node's slot across all pages.
    ///
    /// Returns `true` if the node was found and freed.
    pub fn free_node(&mut self, node_id: &NodeId) -> bool {
        if let Some(page_idx) = self.node_page.remove(node_id) {
            if let Some(page) = self.pages.get_mut(page_idx as usize) {
                return page.free_node(node_id);
            }
        }
        false
    }

    /// Get the allocation for a node (page index + slot).
    pub fn get_allocation(&self, node_id: &NodeId) -> Option<AtlasAllocation> {
        let page_idx = self.node_page.get(node_id)?;
        self.pages
            .get(*page_idx as usize)?
            .get_allocation(node_id)
    }

    /// Get the atlas page image and source rect for a node.
    ///
    /// Returns `(atlas_image, src_rect)` for use with `draw_image_rect`.
    /// Returns `None` if the node isn't in the atlas.
    pub fn get_image_and_src_rect(
        &mut self,
        node_id: &NodeId,
    ) -> Option<(&Image, skia_safe::Rect)> {
        let page_idx = *self.node_page.get(node_id)? as usize;
        let page = self.pages.get_mut(page_idx)?;
        let alloc = page.get_allocation(node_id)?;
        let src_rect = alloc.src_rect();
        let image = page.image();
        Some((image, src_rect))
    }

    /// Draw a node's content into its allocated slot.
    ///
    /// `draw_fn` receives a canvas clipped and translated to the slot's
    /// region. Draw as if starting at (0, 0).
    ///
    /// Returns `false` if the node has no allocation.
    pub fn draw_into_slot(
        &mut self,
        node_id: &NodeId,
        draw_fn: impl FnOnce(&skia_safe::Canvas),
    ) -> bool {
        let page_idx = match self.node_page.get(node_id) {
            Some(&idx) => idx as usize,
            None => return false,
        };
        match self.pages.get_mut(page_idx) {
            Some(page) => page.draw_into_slot(node_id, draw_fn),
            None => false,
        }
    }

    /// Check if a node is in the atlas.
    pub fn has_node(&self, node_id: &NodeId) -> bool {
        self.node_page.contains_key(node_id)
    }

    /// Total number of nodes across all pages.
    pub fn total_nodes(&self) -> usize {
        self.node_page.len()
    }

    /// Number of active pages.
    pub fn page_count(&self) -> usize {
        self.pages.len()
    }

    /// Compact all pages (reclaim trailing empty shelves).
    pub fn compact(&mut self) {
        for page in &mut self.pages {
            page.compact();
        }
    }

    /// Remove empty pages from the end of the page list.
    ///
    /// Only trailing empty pages can be removed (pages in the middle may
    /// still be referenced by `node_page` indices).
    pub fn trim_empty_pages(&mut self) {
        while let Some(page) = self.pages.last() {
            if page.is_empty() {
                self.pages.pop();
            } else {
                break;
            }
        }
    }

    /// Clear all pages and free all allocations.
    pub fn clear(&mut self) {
        self.pages.clear();
        self.node_page.clear();
    }

    /// Get a reference to a page by index.
    pub fn page(&self, index: u32) -> Option<&AtlasPage> {
        self.pages.get(index as usize)
    }

    /// Get a mutable reference to a page by index.
    pub fn page_mut(&mut self, index: u32) -> Option<&mut AtlasPage> {
        self.pages.get_mut(index as usize)
    }

    /// Statistics for the entire atlas set.
    pub fn stats(&self) -> AtlasSetStats {
        let mut total_used = 0u64;
        let mut total_atlas = 0u64;
        for page in &self.pages {
            let s = page.packer_stats();
            total_used += s.used_area;
            total_atlas += s.atlas_area;
        }
        AtlasSetStats {
            page_count: self.pages.len() as u32,
            total_nodes: self.node_page.len() as u32,
            total_used_area: total_used,
            total_atlas_area: total_atlas,
            efficiency: if total_atlas > 0 {
                total_used as f32 / total_atlas as f32
            } else {
                0.0
            },
        }
    }
}

impl std::fmt::Debug for AtlasSet {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AtlasSet")
            .field("config", &self.config)
            .field("page_count", &self.pages.len())
            .field("total_nodes", &self.node_page.len())
            .field("stats", &self.stats())
            .finish()
    }
}
