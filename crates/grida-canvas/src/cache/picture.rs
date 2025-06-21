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
    node_pictures: HashMap<NodeId, Picture>,
}

impl PictureCache {
    pub fn new() -> Self {
        Self {
            strategy: PictureCacheStrategy::default(),
            node_pictures: HashMap::new(),
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
        self.node_pictures.get(id)
    }

    pub fn set_node_picture(&mut self, id: NodeId, picture: Picture) {
        self.node_pictures.insert(id, picture);
    }

    pub fn len(&self) -> usize {
        self.node_pictures.len()
    }

    pub fn depth(&self) -> Option<usize> {
        self.strategy.depth
    }

    pub fn invalidate(&mut self) {
        self.node_pictures.clear();
    }
}
