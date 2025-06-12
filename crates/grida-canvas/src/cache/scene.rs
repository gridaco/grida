use crate::cache::{geometry::GeometryCache, picture::{PictureCache, PictureCacheStrategy}};
use crate::node::schema::{Scene, NodeId};
use skia_safe::Picture;

/// A unified cache storing geometry information and recorded pictures for a scene.
#[derive(Debug, Clone)]
pub struct SceneCache {
    geometry: GeometryCache,
    picture: PictureCache,
}

impl SceneCache {
    /// Create a new empty cache with the given picture cache strategy.
    pub fn new(strategy: PictureCacheStrategy) -> Self {
        Self {
            geometry: GeometryCache::new(),
            picture: PictureCache::new(strategy),
        }
    }

    /// Rebuild the geometry cache from the provided scene.
    pub fn update_geometry(&mut self, scene: &Scene) {
        self.geometry = GeometryCache::from_scene(scene);
    }

    /// Access the geometry cache.
    pub fn geometry(&self) -> &GeometryCache {
        &self.geometry
    }

    /// Mutable access to the geometry cache.
    pub fn geometry_mut(&mut self) -> &mut GeometryCache {
        &mut self.geometry
    }

    /// Access the picture cache.
    pub fn picture(&self) -> &PictureCache {
        &self.picture
    }

    /// Mutable access to the picture cache.
    pub fn picture_mut(&mut self) -> &mut PictureCache {
        &mut self.picture
    }

    /// Retrieve the current picture cache strategy.
    pub fn strategy(&self) -> &PictureCacheStrategy {
        self.picture.strategy()
    }

    /// Set the picture cache strategy and invalidate existing pictures.
    pub fn set_strategy(&mut self, strategy: PictureCacheStrategy) {
        self.picture.set_strategy(strategy);
    }

    /// Invalidate all cached data.
    pub fn invalidate(&mut self) {
        self.geometry = GeometryCache::new();
        self.picture.invalidate();
    }

    /// Return a picture for the entire scene if cached.
    pub fn get_picture(&self) -> Option<&Picture> {
        self.picture.get_picture()
    }

    /// Return a picture for a specific node if cached.
    pub fn get_node_picture(&self, id: &NodeId) -> Option<&Picture> {
        self.picture.get_node_picture(id)
    }

    /// Store a picture for the whole scene.
    pub fn set_picture(&mut self, picture: Picture) {
        self.picture.set_picture(picture);
    }

    /// Store a picture for a node.
    pub fn set_node_picture(&mut self, id: NodeId, picture: Picture) {
        self.picture.set_node_picture(id, picture);
    }

    /// Remove all node pictures.
    pub fn clear_node_pictures(&mut self) {
        self.picture.clear_node_pictures();
    }
}
