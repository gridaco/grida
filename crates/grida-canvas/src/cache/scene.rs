use crate::node::schema::{NodeId, Scene};
use crate::{
    cache::{
        geometry::GeometryCache,
        picture::{PictureCache, PictureCacheStrategy},
        tile::ImageTileCache,
    },
    painter::layer::{Layer, LayerList},
};
use math2::rect::Rectangle;
use rstar::{AABB, RTree, RTreeObject};
use skia_safe::Picture;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct IndexedLayer {
    pub index: usize,
    pub bounds: AABB<[f32; 2]>,
}

impl RTreeObject for IndexedLayer {
    type Envelope = AABB<[f32; 2]>;

    fn envelope(&self) -> Self::Envelope {
        self.bounds
    }
}

/// A unified cache storing geometry information and recorded pictures for a scene.
#[derive(Debug, Clone)]
pub struct SceneCache {
    pub layers: LayerList,
    pub geometry: GeometryCache,
    pub picture: PictureCache,
    pub tile: ImageTileCache,
    pub layer_index: RTree<IndexedLayer>,
}

impl SceneCache {
    /// Create a new empty cache with the given picture cache strategy.
    pub fn new() -> Self {
        Self {
            layers: LayerList::default(),
            geometry: GeometryCache::new(),
            picture: PictureCache::new(),
            tile: ImageTileCache::new(),
            layer_index: RTree::new(),
        }
    }

    /// Rebuild the geometry cache from the provided scene.
    pub fn update_geometry(&mut self, scene: &Scene) {
        self.geometry = GeometryCache::from_scene(scene);
    }

    pub fn update_layers(&mut self, scene: &Scene) {
        self.layers = LayerList::from_scene(scene, &self.geometry);
        self.layers.layers.sort_by_key(|l| l.z_index());
        self.layer_index = RTree::new();
        for (i, layer) in self.layers.layers.iter().enumerate() {
            if let Some(rb) = self.geometry.get_render_bounds(&layer.id()) {
                let bounds = AABB::from_corners([rb.x, rb.y], [rb.x + rb.width, rb.y + rb.height]);
                self.layer_index.insert(IndexedLayer { index: i, bounds });
            }
        }
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
    pub fn picture_strategy(&self) -> &PictureCacheStrategy {
        self.picture.strategy()
    }

    /// Invalidate all cached data.
    pub fn invalidate(&mut self) {
        self.picture.invalidate();
    }

    /// Return a picture for a specific node if cached.
    pub fn get_node_picture(&self, id: &NodeId) -> Option<&Picture> {
        self.picture.get_node_picture(id)
    }

    /// Store a picture for a node.
    pub fn set_node_picture(&mut self, id: NodeId, picture: Picture) {
        self.picture.set_node_picture(id, picture);
    }

    /// Query painter layer indices whose bounds intersect the given rectangle.
    pub fn layers_in_rect(&self, rect: Rectangle) -> Vec<usize> {
        let env = AABB::from_corners(
            [rect.x, rect.y],
            [rect.x + rect.width, rect.y + rect.height],
        );
        self.layer_index
            .locate_in_envelope_intersecting(&env)
            .map(|il| il.index)
            .collect()
    }
}
