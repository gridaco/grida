use crate::cache::fast_hash::{new_node_id_map, NodeIdHashMap};
use crate::node::schema::NodeId;
use skia_safe::Picture;

/// Configuration for how the scene should be cached.
///
/// Currently only the `depth` parameter is used:
/// - `None` caches the entire scene as a single picture.
/// - `Some(depth)` caches up to `depth` levels of nodes separately.
#[derive(Debug, Clone)]
pub struct PictureCacheStrategy {
    pub depth: Option<usize>,
}

impl Default for PictureCacheStrategy {
    fn default() -> Self {
        Self { depth: None }
    }
}

#[derive(Debug, Clone)]
pub struct PictureCache {
    strategy: PictureCacheStrategy,
    /// Fast-path store for the default render variant (variant key = 0).
    default_store: NodeIdHashMap<NodeId, Picture>,
    /// Store for non-default render variants (variant key != 0).
    variant_store: NodeIdHashMap<(NodeId, u64), Picture>,
    /// Monotonically increasing counter incremented on any cache mutation
    /// (insert, invalidate, invalidate_node). The prefill loop uses this
    /// to skip the 136K-iteration cache-hit check when nothing changed.
    generation: u64,
}

impl PictureCache {
    pub fn new() -> Self {
        Self {
            strategy: PictureCacheStrategy::default(),
            default_store: new_node_id_map(),
            variant_store: new_node_id_map(),
            generation: 0,
        }
    }

    pub fn strategy(&self) -> &PictureCacheStrategy {
        &self.strategy
    }

    pub fn set_strategy(&mut self, strategy: PictureCacheStrategy) {
        self.strategy = strategy;
        self.invalidate();
    }

    pub fn get_node_picture(&self, id: &NodeId) -> Option<&Picture> {
        self.default_store.get(id)
    }

    /// Returns the current cache generation counter. This increments on
    /// every mutation (insert, invalidate). Callers can compare generations
    /// to detect whether the cache contents have changed.
    #[inline]
    pub fn generation(&self) -> u64 {
        self.generation
    }

    pub fn set_node_picture(&mut self, id: NodeId, picture: Picture) {
        self.default_store.insert(id, picture);
        self.generation = self.generation.wrapping_add(1);
    }

    /// Lookup a picture for a node in a specific render variant.
    ///
    /// - `variant_key = 0` resolves to the default fast-path store.
    pub fn get_node_picture_variant(&self, id: &NodeId, variant_key: u64) -> Option<&Picture> {
        if variant_key == 0 {
            return self.default_store.get(id);
        }
        self.variant_store.get(&(id.clone(), variant_key))
    }

    /// Store a picture for a node in a specific render variant.
    ///
    /// - `variant_key = 0` resolves to the default fast-path store.
    pub fn set_node_picture_variant(&mut self, id: NodeId, variant_key: u64, picture: Picture) {
        if variant_key == 0 {
            self.default_store.insert(id, picture);
        } else {
            self.variant_store.insert((id, variant_key), picture);
        }
        self.generation = self.generation.wrapping_add(1);
    }

    pub fn len(&self) -> usize {
        self.default_store.len() + self.variant_store.len()
    }

    /// Returns true when the variant store has no entries.
    /// When this is true AND variant unification is enabled, ALL cached
    /// pictures live under the default key (0), making the prefill skip
    /// safe across stable/unstable transitions.
    #[inline]
    pub fn variant_store_is_empty(&self) -> bool {
        self.variant_store.is_empty()
    }

    pub fn depth(&self) -> Option<usize> {
        self.strategy.depth
    }

    pub fn invalidate(&mut self) {
        self.default_store.clear();
        self.variant_store.clear();
        self.generation = self.generation.wrapping_add(1);
    }

    /// Invalidate cached pictures for a single node (all variants).
    ///
    /// Note: `variant_store.retain()` is O(n) over all entries.
    /// Called on each keystroke during text editing. If profiling shows
    /// this is hot, consider a `HashMap<NodeId, HashMap<VariantKey, …>>`
    /// to make per-node invalidation O(1).
    pub fn invalidate_node(&mut self, id: NodeId) {
        self.default_store.remove(&id);
        self.variant_store.retain(|&(nid, _), _| nid != id);
        self.generation = self.generation.wrapping_add(1);
    }
}
