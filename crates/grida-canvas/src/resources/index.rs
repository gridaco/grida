use std::collections::HashMap;

/// Logical resource identifier index mapping `res://` RIDs to blob hashes.
#[derive(Default)]
pub struct ResourceIndex {
    map: HashMap<String, u64>,
}

impl ResourceIndex {
    /// Create a new empty index.
    pub fn new() -> Self {
        Self {
            map: HashMap::new(),
        }
    }

    /// Associate a RID with a blob hash.
    pub fn insert(&mut self, rid: String, hash: u64) {
        self.map.insert(rid, hash);
    }

    /// Get the blob hash for a RID.
    pub fn get(&self, rid: &str) -> Option<u64> {
        self.map.get(rid).copied()
    }

    /// Remove a RID mapping returning its blob hash if present.
    pub fn remove(&mut self, rid: &str) -> Option<u64> {
        self.map.remove(rid)
    }

    /// Number of resources indexed.
    pub fn len(&self) -> usize {
        self.map.len()
    }

    /// Whether the index is empty.
    pub fn is_empty(&self) -> bool {
        self.map.is_empty()
    }
}
