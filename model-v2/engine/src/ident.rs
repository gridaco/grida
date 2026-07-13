//! ENG-2.3 / ENG-1.4 · the cache-key identity.
//!
//! The model owns the one runtime node-key domain: arena incarnation, slot,
//! and generation. The engine re-exports that type instead of defining a
//! second identity that could drift from document liveness rules.

use anchor_lab::model::{Document, NodeId};

/// The single arena-scoped, generation-stamped runtime node identity.
pub use anchor_lab::model::NodeKey as Key;

/// Mint a key only for a live node. Dead, missing, and tombstoned slots have
/// no identity.
pub fn key_of(doc: &Document, id: NodeId) -> Option<Key> {
    doc.key_of(id)
}
