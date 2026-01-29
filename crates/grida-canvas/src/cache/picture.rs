use crate::node::schema::NodeId;
use skia_safe::Picture;
use std::collections::HashMap;

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
    default_store: HashMap<NodeId, Picture>,
    /// Store for non-default render variants (variant key != 0).
    variant_store: HashMap<(NodeId, u64), Picture>,
}

impl PictureCache {
    pub fn new() -> Self {
        Self {
            strategy: PictureCacheStrategy::default(),
            default_store: HashMap::new(),
            variant_store: HashMap::new(),
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

    pub fn set_node_picture(&mut self, id: NodeId, picture: Picture) {
        self.default_store.insert(id, picture);
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
            return;
        }
        self.variant_store.insert((id, variant_key), picture);
    }

    pub fn len(&self) -> usize {
        self.default_store.len() + self.variant_store.len()
    }

    pub fn depth(&self) -> Option<usize> {
        self.strategy.depth
    }

    pub fn invalidate(&mut self) {
        self.default_store.clear();
        self.variant_store.clear();
    }
}
