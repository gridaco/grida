use crate::cache::{
    geometry::GeometryCache,
    picture::{PictureCache, PictureCacheStrategy},
};
use crate::node::schema::{NodeId, Scene};
use skia_safe::{Image, Picture};

/// A unified cache storing geometry information and recorded pictures for a scene.
#[derive(Debug, Clone)]
pub struct SceneCache {
    geometry: GeometryCache,
    picture: PictureCache,
    image: Option<Image>,
}

impl SceneCache {
    /// Create a new empty cache with the given picture cache strategy.
    pub fn new(strategy: PictureCacheStrategy) -> Self {
        Self {
            geometry: GeometryCache::new(),
            picture: PictureCache::new(strategy),
            image: None,
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

    /// Access the image cache.
    pub fn image(&self) -> Option<&Image> {
        self.image.as_ref()
    }

    pub fn set_image(&mut self, image: Image) {
        self.image = Some(image);
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
    pub fn picture_strategy(&self) -> &PictureCacheStrategy {
        self.picture.strategy()
    }

    /// Invalidate all cached data.
    pub fn invalidate(&mut self) {
        self.geometry = GeometryCache::new();
        self.picture.invalidate();
        self.image = None;
    }

    /// Return a picture for a specific node if cached.
    pub fn get_node_picture(&self, id: &NodeId) -> Option<&Picture> {
        self.picture.get_node_picture(id)
    }

    /// Store a picture for a node.
    pub fn set_node_picture(&mut self, id: NodeId, picture: Picture) {
        self.picture.set_node_picture(id, picture);
    }
}
