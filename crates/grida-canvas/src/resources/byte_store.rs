use std::collections::HashMap;

/// In-memory byte store keyed by content hash.
///
/// Uses a simple HashMap with `u64` keys produced by SeaHash.
#[derive(Default)]
pub struct ByteStore {
    blobs: HashMap<u64, Vec<u8>>,
}

impl ByteStore {
    /// Create a new empty byte store.
    pub fn new() -> Self {
        Self {
            blobs: HashMap::new(),
        }
    }

    /// Insert bytes into the store returning their content hash.
    pub fn insert(&mut self, hash: u64, bytes: Vec<u8>) {
        self.blobs.entry(hash).or_insert(bytes);
    }

    /// Get bytes by their content hash.
    pub fn get(&self, hash: u64) -> Option<&Vec<u8>> {
        self.blobs.get(&hash)
    }

    /// Remove bytes by their content hash.
    pub fn remove(&mut self, hash: u64) -> Option<Vec<u8>> {
        self.blobs.remove(&hash)
    }

    /// Number of blobs stored.
    pub fn len(&self) -> usize {
        self.blobs.len()
    }

    /// Whether the store is empty.
    pub fn is_empty(&self) -> bool {
        self.blobs.is_empty()
    }
}
