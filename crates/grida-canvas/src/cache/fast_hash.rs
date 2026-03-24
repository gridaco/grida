//! Fast hasher for u64-keyed HashMaps in the rendering hot path.
//!
//! The default `HashMap` uses SipHash-1-3, which provides DoS resistance
//! at ~25ns per hash. For trusted-input rendering caches keyed by `NodeId`
//! (u64), we can use a much faster multiplicative hash (~3ns) since there
//! is no untrusted input to defend against.
//!
//! This is the same approach as `rustc-hash` (FxHash): multiply by a large
//! odd constant to scatter bits, then use the result directly as the hash.

use std::collections::HashMap;
use std::hash::{BuildHasher, Hasher};

/// A fast hasher for integer keys.
///
/// Uses a single multiply to distribute bits. Suitable for u64 keys
/// (NodeId) and (u64, u64) tuple keys used in the picture/geometry/
/// compositor caches.
#[derive(Default)]
pub struct NodeIdHasher {
    hash: u64,
}

impl Hasher for NodeIdHasher {
    #[inline]
    fn write(&mut self, bytes: &[u8]) {
        // For arbitrary byte sequences, use a simple FNV-like combine.
        for &b in bytes {
            self.hash = self.hash.wrapping_mul(0x100000001b3).wrapping_add(b as u64);
        }
    }

    #[inline]
    fn write_u64(&mut self, i: u64) {
        // FxHash: XOR-fold then multiply by a large odd constant.
        // This is the primary fast path for NodeId (u64) keys.
        self.hash = self.hash ^ i;
        self.hash = self.hash.wrapping_mul(0x517cc1b727220a95);
    }

    #[inline]
    fn finish(&self) -> u64 {
        self.hash
    }
}

/// BuildHasher that produces `NodeIdHasher` instances.
#[derive(Clone, Default)]
pub struct NodeIdBuildHasher;

impl BuildHasher for NodeIdBuildHasher {
    type Hasher = NodeIdHasher;

    #[inline]
    fn build_hasher(&self) -> NodeIdHasher {
        NodeIdHasher::default()
    }
}

/// A HashMap using the fast NodeId hasher.
///
/// Use this for caches keyed by `NodeId` (u64) or `(NodeId, u64)` tuples
/// where keys come from trusted internal sources (no DoS risk).
pub type NodeIdHashMap<K, V> = HashMap<K, V, NodeIdBuildHasher>;

/// Create a new empty NodeIdHashMap.
#[inline]
pub fn new_node_id_map<K, V>() -> NodeIdHashMap<K, V> {
    HashMap::with_hasher(NodeIdBuildHasher)
}

/// Create a new NodeIdHashMap with the specified capacity.
#[inline]
pub fn new_node_id_map_with_capacity<K, V>(capacity: usize) -> NodeIdHashMap<K, V> {
    HashMap::with_capacity_and_hasher(capacity, NodeIdBuildHasher)
}
