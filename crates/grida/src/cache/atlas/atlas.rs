//! Single atlas page: a GPU surface backed by a shelf packer.
//!
//! An [`AtlasPage`] owns one Skia `Surface` (GPU texture) and a
//! [`ShelfPacker`] that manages sub-region allocation within it. Cached
//! node images are drawn into allocated slots, and compositing reads
//! sub-rects from the page's `Image`.
//!
//! This module depends on Skia types (`Surface`, `Image`, `Canvas`).
//! The packing logic itself is in [`super::packing`] and has no GPU
//! dependencies.

use super::packing::{ShelfPacker, Slot, SlotId};
use crate::cache::fast_hash::{new_node_id_map, NodeIdHashMap};
use crate::node::schema::NodeId;
use skia_safe::{Canvas, Image, Rect, Surface};

/// A single atlas page.
///
/// Wraps a GPU `Surface` (the atlas texture) and a [`ShelfPacker`] for
/// sub-rect allocation. Nodes are drawn into slots on this page.
pub struct AtlasPage {
    /// The GPU surface backing this atlas page.
    surface: Surface,
    /// The snapshot image (regenerated after writes).
    image: Option<Image>,
    /// Shelf packer managing slot allocation.
    packer: ShelfPacker,
    /// Map from slot ID to the node that occupies it.
    slot_to_node: NodeIdHashMap<SlotId, NodeId>,
    /// Map from node ID to its allocated slot.
    node_to_slot: NodeIdHashMap<NodeId, Slot>,
    /// Whether the surface has been modified since the last snapshot.
    dirty: bool,
    /// Page index (for multi-page atlas sets).
    pub page_index: u32,
}

/// Result of a successful allocation on an atlas page.
#[derive(Debug, Clone, Copy)]
pub struct AtlasAllocation {
    /// The page index this allocation is on.
    pub page_index: u32,
    /// The slot within the page.
    pub slot: Slot,
}

impl AtlasAllocation {
    /// Source rect for `draw_image_rect` — the sub-rect of the atlas texture
    /// that contains this node's cached image.
    pub fn src_rect(&self) -> Rect {
        Rect::from_xywh(
            self.slot.x as f32,
            self.slot.y as f32,
            self.slot.width as f32,
            self.slot.height as f32,
        )
    }
}

impl AtlasPage {
    /// Create a new atlas page backed by a GPU surface.
    ///
    /// `surface` must be a GPU-backed Skia surface of the desired atlas
    /// dimensions (e.g. 4096x4096). The caller is responsible for creating
    /// the surface from the appropriate GPU context.
    pub fn new(surface: Surface, page_index: u32) -> Self {
        let w = surface.width() as u32;
        let h = surface.height() as u32;
        Self {
            surface,
            image: None,
            packer: ShelfPacker::new(w, h),
            slot_to_node: new_node_id_map(),
            node_to_slot: new_node_id_map(),
            dirty: false,
            page_index,
        }
    }

    /// Try to allocate a slot for a node of the given pixel dimensions.
    ///
    /// Returns `None` if the node doesn't fit on this page.
    pub fn allocate(
        &mut self,
        node_id: NodeId,
        width: u32,
        height: u32,
    ) -> Option<AtlasAllocation> {
        // If this node already has a slot, free it first.
        self.free_node(&node_id);

        let slot = self.packer.allocate(width, height)?;
        self.slot_to_node.insert(slot.id, node_id);
        self.node_to_slot.insert(node_id, slot);

        Some(AtlasAllocation {
            page_index: self.page_index,
            slot,
        })
    }

    /// Free a node's slot, making the space available for compaction.
    ///
    /// Returns `true` if the node was found and freed.
    pub fn free_node(&mut self, node_id: &NodeId) -> bool {
        if let Some(slot) = self.node_to_slot.remove(node_id) {
            self.slot_to_node.remove(&slot.id);
            self.packer.free(&slot);
            true
        } else {
            false
        }
    }

    /// Get the slot for a node, if it's allocated on this page.
    pub fn get_slot(&self, node_id: &NodeId) -> Option<&Slot> {
        self.node_to_slot.get(node_id)
    }

    /// Get the allocation info for a node (page index + slot).
    pub fn get_allocation(&self, node_id: &NodeId) -> Option<AtlasAllocation> {
        self.node_to_slot.get(node_id).map(|slot| AtlasAllocation {
            page_index: self.page_index,
            slot: *slot,
        })
    }

    /// Returns a reference to the atlas canvas for drawing into a slot.
    ///
    /// The caller should draw the node's cached content at the slot's
    /// (x, y) position using `canvas.save()` / `canvas.clip_rect()` /
    /// `canvas.translate()` to isolate the draw to the slot region.
    ///
    /// After drawing, call [`mark_dirty`] to invalidate the cached snapshot.
    pub fn canvas(&mut self) -> &Canvas {
        self.surface.canvas()
    }

    /// Mark the page as dirty (surface modified, snapshot needs refresh).
    pub fn mark_dirty(&mut self) {
        self.dirty = true;
        self.image = None;
    }

    /// Draw a node's content into its allocated slot.
    ///
    /// `draw_fn` receives the canvas with the clip and translation already
    /// set up for the slot region. The caller should draw as if starting
    /// at (0, 0) with the slot's width/height.
    ///
    /// Returns `false` if the node has no slot on this page.
    pub fn draw_into_slot(&mut self, node_id: &NodeId, draw_fn: impl FnOnce(&Canvas)) -> bool {
        let slot = match self.node_to_slot.get(node_id) {
            Some(s) => *s,
            None => return false,
        };

        let canvas = self.surface.canvas();
        canvas.save();
        canvas.clip_rect(
            Rect::from_xywh(
                slot.x as f32,
                slot.y as f32,
                slot.width as f32,
                slot.height as f32,
            ),
            None,
            true,
        );
        canvas.translate((slot.x as f32, slot.y as f32));
        draw_fn(canvas);
        canvas.restore();

        self.dirty = true;
        self.image = None;
        true
    }

    /// Get the atlas page image for compositing.
    ///
    /// Takes a snapshot of the surface if it's been modified since the last
    /// call. The snapshot is cached until the next modification.
    pub fn image(&mut self) -> &Image {
        if self.image.is_none() {
            self.image = Some(self.surface.image_snapshot());
            self.dirty = false;
        }
        self.image.as_ref().unwrap()
    }

    /// Whether this page has a node allocated.
    pub fn has_node(&self, node_id: &NodeId) -> bool {
        self.node_to_slot.contains_key(node_id)
    }

    /// Number of nodes allocated on this page.
    pub fn node_count(&self) -> usize {
        self.node_to_slot.len()
    }

    /// Whether the page has no allocations.
    pub fn is_empty(&self) -> bool {
        self.packer.is_empty()
    }

    /// Compact the packer (reclaim trailing empty shelves).
    pub fn compact(&mut self) -> u32 {
        self.packer.compact()
    }

    /// Atlas page width in pixels.
    pub fn width(&self) -> u32 {
        self.packer.atlas_width()
    }

    /// Atlas page height in pixels.
    pub fn height(&self) -> u32 {
        self.packer.atlas_height()
    }

    /// Packing statistics for this page.
    pub fn packer_stats(&self) -> super::packing::PackerStats {
        self.packer.stats()
    }
}

// AtlasPage is not Clone because Surface is not Clone.
// It is not Send/Sync because Surface holds GPU state.
// Debug is implemented manually to avoid printing the surface.
impl std::fmt::Debug for AtlasPage {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AtlasPage")
            .field("page_index", &self.page_index)
            .field("size", &format!("{}x{}", self.width(), self.height()))
            .field("node_count", &self.node_count())
            .field("dirty", &self.dirty)
            .field("packer_stats", &self.packer.stats())
            .finish()
    }
}
