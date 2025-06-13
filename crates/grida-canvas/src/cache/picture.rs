use crate::node::schema::NodeId;
use skia_safe::Picture;
use std::collections::HashMap;

/// Configuration for how the scene should be cached.
///
/// Currently only the `depth` parameter is used:
/// - `0` caches the entire scene as a single picture.
/// - `1` caches each top-level node separately.
#[derive(Debug, Clone)]
pub struct PictureCacheStrategy {
    pub depth: usize,
}

impl Default for PictureCacheStrategy {
    fn default() -> Self {
        Self { depth: 1 }
    }
}

#[derive(Debug, Clone)]
pub struct PictureCache {
    strategy: PictureCacheStrategy,
    picture: Option<Picture>,
    node_pictures: HashMap<NodeId, Picture>,
}

impl PictureCache {
    pub fn new(strategy: PictureCacheStrategy) -> Self {
        Self {
            strategy,
            picture: None,
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

    pub fn is_valid(&self) -> bool {
        if self.strategy.depth == 0 {
            self.picture.is_some()
        } else {
            !self.node_pictures.is_empty()
        }
    }

    pub fn get_picture(&self) -> Option<&Picture> {
        self.picture.as_ref()
    }

    pub fn set_picture(&mut self, picture: Picture) {
        self.picture = Some(picture);
    }

    pub fn get_node_picture(&self, id: &NodeId) -> Option<&Picture> {
        self.node_pictures.get(id)
    }

    pub fn set_node_picture(&mut self, id: NodeId, picture: Picture) {
        self.node_pictures.insert(id, picture);
    }

    pub fn clear_node_pictures(&mut self) {
        self.node_pictures.clear();
    }

    pub fn len(&self) -> usize {
        self.node_pictures.len()
    }

    pub fn depth(&self) -> usize {
        self.strategy.depth
    }

    pub fn invalidate(&mut self) {
        self.picture = None;
        self.node_pictures.clear();
    }
}
