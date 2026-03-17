//! Shelf-based rectangle packing for texture atlases.
//!
//! This module provides a pure-geometry bin packing algorithm with no GPU
//! dependencies. It packs variable-sized rectangles into a fixed-size atlas
//! using a shelf (row) strategy with best-fit height selection.
//!
//! # Algorithm
//!
//! The **shelf packing** algorithm divides the atlas into horizontal rows
//! (shelves). Each shelf has a fixed height determined by the first
//! rectangle placed on it. Rectangles are placed left-to-right on the
//! current best-fit shelf, or a new shelf is started if no existing shelf
//! has room.
//!
//! Shelf packing is chosen over skyline or maxrects because:
//! - Simple to implement correctly
//! - O(shelves) allocation, O(1) deallocation
//! - Good enough packing efficiency for the compositor use case (nodes
//!   have similar heights within a scene)
//! - Easy to reason about fragmentation and defragmentation
//!
//! # Usage
//!
//! ```ignore
//! let mut packer = ShelfPacker::new(4096, 4096);
//! let slot = packer.allocate(100, 80).expect("fits");
//! // slot.x, slot.y, slot.width, slot.height are the atlas-space coords
//! packer.free(&slot);
//! ```

/// Unique identifier for an allocated slot within a packer.
pub type SlotId = u64;

/// An allocated rectangle within the atlas.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Slot {
    /// Unique identifier for this allocation.
    pub id: SlotId,
    /// X position in atlas pixels (top-left corner).
    pub x: u32,
    /// Y position in atlas pixels (top-left corner).
    pub y: u32,
    /// Width of the allocated region in pixels.
    pub width: u32,
    /// Height of the allocated region in pixels.
    pub height: u32,
    /// Index of the shelf this slot belongs to (internal).
    shelf_index: usize,
}

/// A horizontal row (shelf) within the atlas.
#[derive(Debug, Clone)]
struct Shelf {
    /// Y position of this shelf's top edge.
    y: u32,
    /// Height of this shelf (set by the first allocation).
    height: u32,
    /// Current x cursor (next free position on this shelf).
    x_cursor: u32,
    /// Number of active (non-freed) allocations on this shelf.
    active_count: u32,
    /// Total number of allocations ever made on this shelf (for stats).
    total_allocated: u32,
}

impl Shelf {
    fn remaining_width(&self, atlas_width: u32) -> u32 {
        atlas_width.saturating_sub(self.x_cursor)
    }

    fn can_fit(&self, width: u32, height: u32, atlas_width: u32) -> bool {
        width <= self.remaining_width(atlas_width) && height <= self.height
    }
}

/// Packing statistics.
#[derive(Debug, Clone, Copy, Default)]
pub struct PackerStats {
    /// Total atlas area in pixels.
    pub atlas_area: u64,
    /// Area occupied by active allocations.
    pub used_area: u64,
    /// Number of active allocations.
    pub active_slots: u32,
    /// Number of shelves in use.
    pub shelf_count: u32,
    /// Packing efficiency (used_area / atlas_area).
    pub efficiency: f32,
}

/// Shelf-based rectangle packer.
///
/// Allocates rectangular regions within a fixed-size atlas. Allocations are
/// append-only within each shelf (no coalescing of freed gaps within a shelf).
/// Freed slots decrement the shelf's active count; when a shelf reaches zero
/// active allocations, it can be reclaimed by [`compact`].
#[derive(Debug, Clone)]
pub struct ShelfPacker {
    width: u32,
    height: u32,
    shelves: Vec<Shelf>,
    /// Y cursor for the next new shelf.
    y_cursor: u32,
    /// Monotonically increasing slot ID counter.
    next_id: SlotId,
    /// Total area of active allocations (for stats).
    used_area: u64,
    /// Number of active allocations.
    active_count: u32,
}

impl ShelfPacker {
    /// Create a new packer for an atlas of the given pixel dimensions.
    pub fn new(width: u32, height: u32) -> Self {
        Self {
            width,
            height,
            shelves: Vec::new(),
            y_cursor: 0,
            next_id: 1,
            used_area: 0,
            active_count: 0,
        }
    }

    /// Atlas width in pixels.
    pub fn atlas_width(&self) -> u32 {
        self.width
    }

    /// Atlas height in pixels.
    pub fn atlas_height(&self) -> u32 {
        self.height
    }

    /// Allocate a rectangular region of the given size.
    ///
    /// Returns `None` if the rectangle doesn't fit in any existing shelf
    /// and there's not enough vertical space for a new shelf.
    ///
    /// The returned [`Slot`] contains the atlas-space coordinates and a
    /// unique `id` for later freeing.
    pub fn allocate(&mut self, width: u32, height: u32) -> Option<Slot> {
        if width == 0 || height == 0 || width > self.width || height > self.height {
            return None;
        }

        // Try to find the best-fit existing shelf.
        // Best-fit = smallest shelf height that can accommodate this rect,
        // with enough remaining width.
        let mut best_shelf: Option<usize> = None;
        let mut best_waste: u32 = u32::MAX;

        for (i, shelf) in self.shelves.iter().enumerate() {
            if shelf.can_fit(width, height, self.width) {
                let waste = shelf.height - height;
                if waste < best_waste {
                    best_waste = waste;
                    best_shelf = Some(i);
                    if waste == 0 {
                        break; // Perfect fit, stop searching
                    }
                }
            }
        }

        if let Some(si) = best_shelf {
            // Place on existing shelf.
            return Some(self.place_on_shelf(si, width, height));
        }

        // No existing shelf works — create a new one.
        if self.y_cursor + height > self.height {
            return None; // Atlas is full vertically.
        }

        let si = self.shelves.len();
        self.shelves.push(Shelf {
            y: self.y_cursor,
            height,
            x_cursor: 0,
            active_count: 0,
            total_allocated: 0,
        });
        self.y_cursor += height;

        Some(self.place_on_shelf(si, width, height))
    }

    /// Place a rectangle on a specific shelf and return the slot.
    fn place_on_shelf(&mut self, shelf_index: usize, width: u32, height: u32) -> Slot {
        let shelf = &mut self.shelves[shelf_index];
        let x = shelf.x_cursor;
        let y = shelf.y;

        shelf.x_cursor += width;
        shelf.active_count += 1;
        shelf.total_allocated += 1;

        let id = self.next_id;
        self.next_id += 1;
        self.used_area += (width as u64) * (height as u64);
        self.active_count += 1;

        Slot {
            id,
            x,
            y,
            width,
            height,
            shelf_index,
        }
    }

    /// Free a previously allocated slot.
    ///
    /// The space is not immediately reusable (shelf packing is append-only
    /// within a shelf). The shelf's active count is decremented; when it
    /// reaches zero, the shelf becomes eligible for reclamation via
    /// [`compact`].
    pub fn free(&mut self, slot: &Slot) {
        if slot.shelf_index < self.shelves.len() {
            let shelf = &mut self.shelves[slot.shelf_index];
            shelf.active_count = shelf.active_count.saturating_sub(1);
        }
        self.used_area = self
            .used_area
            .saturating_sub((slot.width as u64) * (slot.height as u64));
        self.active_count = self.active_count.saturating_sub(1);
    }

    /// Compact the packer by removing empty shelves at the bottom.
    ///
    /// Only trailing empty shelves (those at the highest Y coordinates) can
    /// be reclaimed. This is because shelves above them may still have
    /// active allocations and can't be moved without invalidating slot
    /// coordinates.
    ///
    /// Returns the number of shelves reclaimed.
    pub fn compact(&mut self) -> u32 {
        let mut reclaimed = 0u32;
        while let Some(shelf) = self.shelves.last() {
            if shelf.active_count == 0 {
                let h = shelf.height;
                self.shelves.pop();
                self.y_cursor -= h;
                reclaimed += 1;
            } else {
                break;
            }
        }
        reclaimed
    }

    /// Reset the packer, freeing all allocations.
    pub fn clear(&mut self) {
        self.shelves.clear();
        self.y_cursor = 0;
        self.used_area = 0;
        self.active_count = 0;
        // Don't reset next_id — slot IDs should remain unique across clears.
    }

    /// Number of active allocations.
    pub fn active_count(&self) -> u32 {
        self.active_count
    }

    /// Remaining vertical space (from y_cursor to atlas bottom).
    pub fn remaining_height(&self) -> u32 {
        self.height.saturating_sub(self.y_cursor)
    }

    /// Whether the packer has any active allocations.
    pub fn is_empty(&self) -> bool {
        self.active_count == 0
    }

    /// Packing statistics.
    pub fn stats(&self) -> PackerStats {
        let atlas_area = (self.width as u64) * (self.height as u64);
        PackerStats {
            atlas_area,
            used_area: self.used_area,
            active_slots: self.active_count,
            shelf_count: self.shelves.len() as u32,
            efficiency: if atlas_area > 0 {
                self.used_area as f32 / atlas_area as f32
            } else {
                0.0
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_packer() {
        let p = ShelfPacker::new(256, 256);
        assert_eq!(p.active_count(), 0);
        assert!(p.is_empty());
        assert_eq!(p.remaining_height(), 256);
        let s = p.stats();
        assert_eq!(s.atlas_area, 256 * 256);
        assert_eq!(s.used_area, 0);
        assert_eq!(s.shelf_count, 0);
    }

    #[test]
    fn single_allocation() {
        let mut p = ShelfPacker::new(256, 256);
        let slot = p.allocate(100, 50).unwrap();
        assert_eq!(slot.x, 0);
        assert_eq!(slot.y, 0);
        assert_eq!(slot.width, 100);
        assert_eq!(slot.height, 50);
        assert_eq!(p.active_count(), 1);
        assert_eq!(p.remaining_height(), 206);
    }

    #[test]
    fn two_on_same_shelf() {
        let mut p = ShelfPacker::new(256, 256);
        let a = p.allocate(100, 50).unwrap();
        let b = p.allocate(80, 40).unwrap();
        // b goes on the same shelf (height 50 >= 40)
        assert_eq!(a.y, 0);
        assert_eq!(b.y, 0);
        assert_eq!(b.x, 100);
        assert_eq!(p.active_count(), 2);
        assert_eq!(p.stats().shelf_count, 1);
    }

    #[test]
    fn new_shelf_when_width_full() {
        let mut p = ShelfPacker::new(200, 200);
        let a = p.allocate(120, 50).unwrap();
        let b = p.allocate(120, 50).unwrap();
        // b doesn't fit on shelf 0 (remaining width = 80 < 120)
        assert_eq!(a.y, 0);
        assert_eq!(b.y, 50);
        assert_eq!(b.x, 0);
        assert_eq!(p.stats().shelf_count, 2);
    }

    #[test]
    fn new_shelf_when_height_exceeds() {
        let mut p = ShelfPacker::new(200, 200);
        let a = p.allocate(100, 30).unwrap();
        let b = p.allocate(50, 60).unwrap();
        // b is taller than shelf 0 (30 < 60), so new shelf
        assert_eq!(a.y, 0);
        assert_eq!(b.y, 30);
        assert_eq!(p.stats().shelf_count, 2);
    }

    #[test]
    fn best_fit_shelf_selection() {
        // Create three shelves of different heights.
        // Fill widths so only specific shelves have room for the test alloc.
        let mut p = ShelfPacker::new(400, 400);
        p.allocate(400, 100).unwrap(); // shelf 0: height 100, full → no room
        p.allocate(400, 50).unwrap(); // shelf 1: height 50, full → no room
        p.allocate(200, 30).unwrap(); // shelf 2: height 30, 200px remaining

        // 80x28 fits only on shelf 2 (only shelf with room).
        let slot = p.allocate(80, 28).unwrap();
        assert_eq!(slot.y, 150); // shelf 2 starts at y=100+50=150
        assert_eq!(slot.x, 200); // after the 200px on shelf 2

        // Now: best-fit selection between two shelves with room.
        let mut p = ShelfPacker::new(400, 400);
        p.allocate(300, 100).unwrap(); // shelf 0: height 100, 100px remaining
        p.allocate(300, 30).unwrap(); // shelf 1: height 30, 100px remaining

        // 80x25: fits on shelf 0 (waste=75) and shelf 1 (waste=5).
        // Best-fit should pick shelf 1 (smaller waste).
        let slot = p.allocate(80, 25).unwrap();
        assert_eq!(slot.y, 100); // shelf 1 starts at y=100
        assert_eq!(slot.x, 300); // after the 300px on shelf 1
    }

    #[test]
    fn atlas_full_returns_none() {
        let mut p = ShelfPacker::new(100, 100);
        p.allocate(100, 100).unwrap();
        assert!(p.allocate(1, 1).is_none());
    }

    #[test]
    fn vertical_overflow_returns_none() {
        let mut p = ShelfPacker::new(100, 100);
        p.allocate(100, 60).unwrap();
        assert!(p.allocate(100, 60).is_none()); // only 40px remaining
    }

    #[test]
    fn zero_size_returns_none() {
        let mut p = ShelfPacker::new(256, 256);
        assert!(p.allocate(0, 50).is_none());
        assert!(p.allocate(50, 0).is_none());
        assert!(p.allocate(0, 0).is_none());
    }

    #[test]
    fn oversized_returns_none() {
        let mut p = ShelfPacker::new(256, 256);
        assert!(p.allocate(257, 50).is_none());
        assert!(p.allocate(50, 257).is_none());
    }

    #[test]
    fn free_decrements_count() {
        let mut p = ShelfPacker::new(256, 256);
        let slot = p.allocate(100, 50).unwrap();
        assert_eq!(p.active_count(), 1);
        p.free(&slot);
        assert_eq!(p.active_count(), 0);
        assert!(p.is_empty());
    }

    #[test]
    fn free_updates_used_area() {
        let mut p = ShelfPacker::new(256, 256);
        let slot = p.allocate(100, 50).unwrap();
        assert_eq!(p.stats().used_area, 5000);
        p.free(&slot);
        assert_eq!(p.stats().used_area, 0);
    }

    #[test]
    fn compact_reclaims_trailing_empty_shelves() {
        let mut p = ShelfPacker::new(256, 256);
        let _a = p.allocate(256, 50).unwrap(); // shelf 0
        let b = p.allocate(256, 60).unwrap(); // shelf 1
        let c = p.allocate(256, 40).unwrap(); // shelf 2

        assert_eq!(p.remaining_height(), 106); // 256 - 50 - 60 - 40

        p.free(&c); // shelf 2 now empty
        p.free(&b); // shelf 1 now empty
        let reclaimed = p.compact();
        assert_eq!(reclaimed, 2);
        assert_eq!(p.remaining_height(), 206); // 256 - 50

        // shelf 0 still active
        assert_eq!(p.active_count(), 1);

        // Can allocate in reclaimed space
        let d = p.allocate(256, 80).unwrap();
        assert_eq!(d.y, 50); // starts right after shelf 0
    }

    #[test]
    fn compact_stops_at_active_shelf() {
        let mut p = ShelfPacker::new(256, 256);
        let a = p.allocate(256, 50).unwrap(); // shelf 0
        let _b = p.allocate(256, 60).unwrap(); // shelf 1 (kept)
        let c = p.allocate(256, 40).unwrap(); // shelf 2

        p.free(&a); // shelf 0 empty but not trailing
        p.free(&c); // shelf 2 empty and trailing
        let reclaimed = p.compact();
        assert_eq!(reclaimed, 1); // only shelf 2
        assert_eq!(p.remaining_height(), 146); // 256 - 50 - 60
    }

    #[test]
    fn clear_resets_everything() {
        let mut p = ShelfPacker::new(256, 256);
        p.allocate(100, 50).unwrap();
        p.allocate(100, 60).unwrap();
        p.clear();
        assert_eq!(p.active_count(), 0);
        assert_eq!(p.remaining_height(), 256);
        assert_eq!(p.stats().shelf_count, 0);
        assert_eq!(p.stats().used_area, 0);
    }

    #[test]
    fn slot_ids_are_unique() {
        let mut p = ShelfPacker::new(256, 256);
        let a = p.allocate(50, 50).unwrap();
        let b = p.allocate(50, 50).unwrap();
        let c = p.allocate(50, 50).unwrap();
        assert_ne!(a.id, b.id);
        assert_ne!(b.id, c.id);
        assert_ne!(a.id, c.id);
    }

    #[test]
    fn slot_ids_unique_across_clear() {
        let mut p = ShelfPacker::new(256, 256);
        let a = p.allocate(50, 50).unwrap();
        p.clear();
        let b = p.allocate(50, 50).unwrap();
        assert_ne!(a.id, b.id);
    }

    #[test]
    fn many_small_allocations() {
        let mut p = ShelfPacker::new(4096, 4096);
        let size = 64;
        let per_row = 4096 / size;
        let rows = 4096 / size;
        let total = per_row * rows;

        for _ in 0..total {
            assert!(p.allocate(size, size).is_some());
        }

        assert_eq!(p.active_count(), total as u32);
        assert!(p.allocate(size, size).is_none()); // full

        let stats = p.stats();
        assert_eq!(stats.efficiency, 1.0);
    }

    #[test]
    fn mixed_sizes() {
        let mut p = ShelfPacker::new(512, 512);
        let mut slots = Vec::new();

        // Mix of sizes typical for a real scene
        let sizes = [
            (100, 80),
            (50, 50),
            (200, 30),
            (64, 64),
            (150, 100),
            (32, 32),
            (180, 60),
            (90, 90),
        ];

        for &(w, h) in &sizes {
            let slot = p.allocate(w, h).unwrap();
            assert_eq!(slot.width, w);
            assert_eq!(slot.height, h);
            slots.push(slot);
        }

        assert_eq!(p.active_count(), sizes.len() as u32);

        // Free half and compact
        for slot in &slots[4..] {
            p.free(slot);
        }
        assert_eq!(p.active_count(), 4);
    }

    #[test]
    fn exact_fit_uses_full_atlas() {
        let mut p = ShelfPacker::new(256, 256);
        let slot = p.allocate(256, 256).unwrap();
        assert_eq!(slot.x, 0);
        assert_eq!(slot.y, 0);
        assert_eq!(slot.width, 256);
        assert_eq!(slot.height, 256);
        assert_eq!(p.remaining_height(), 0);
    }

    #[test]
    fn stats_accuracy() {
        let mut p = ShelfPacker::new(1024, 1024);
        p.allocate(100, 100).unwrap(); // 10,000 px
        p.allocate(200, 50).unwrap(); // 10,000 px

        let s = p.stats();
        assert_eq!(s.used_area, 20_000);
        assert_eq!(s.active_slots, 2);
        assert_eq!(s.atlas_area, 1024 * 1024);
        assert!((s.efficiency - 20_000.0 / (1024.0 * 1024.0)).abs() < 0.001);
    }
}
