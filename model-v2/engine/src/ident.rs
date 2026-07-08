//! ENG-2.3 / ENG-1.4 · the cache-key type. Cache identity is
//! `(slot, generation)`, never a bare [`NodeId`] — the arena reuses
//! nothing today, but the moment any cache (raster, layout, glyph atlas)
//! exists, a future reused slot must not be able to alias a prior node's
//! cached artifacts. No cache consumes [`Key`] yet: the type IS the
//! socket, and `key_of` (step 3, once `Document::gen_of` lands) is the
//! only sanctioned way to mint one.

use anchor_lab::model::{Document, NodeId};

/// A generation-stamped node identity — the mandated key for every future
/// cache tier. Equality includes the generation, so a recycled slot is a
/// different key.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Key {
    pub id: NodeId,
    pub gen: u32,
}

/// Mint the cache key for a node — the ONLY sanctioned way. Reads the
/// live generation from the arena so a future reused slot yields a
/// distinct key from the node that previously occupied it.
pub fn key_of(doc: &Document, id: NodeId) -> Key {
    Key {
        id,
        gen: doc.gen_of(id),
    }
}
