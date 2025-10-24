use crate::node::schema::{NodeId, Scene};
use crate::runtime::camera::Camera2D;
use crate::runtime::font_repository::FontRepository;
use crate::{
    cache::{
        geometry::GeometryCache,
        paragraph::ParagraphCache,
        picture::{PictureCache, PictureCacheStrategy},
        tile::ImageTileCache,
        vector_path::VectorPathCache,
    },
    painter::layer::{Layer, LayerList},
};
use math2::{rect::Rectangle, vector2::Vector2};
use rstar::{RTree, RTreeObject, AABB};
use skia_safe::{Picture, Surface};

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
    pub paragraph: std::cell::RefCell<ParagraphCache>,
    pub path: std::cell::RefCell<VectorPathCache>,
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
            paragraph: std::cell::RefCell::new(ParagraphCache::new()),
            path: std::cell::RefCell::new(VectorPathCache::new()),
            layer_index: RTree::new(),
        }
    }

    /// Rebuild the geometry cache from the provided scene.
    pub fn update_geometry(&mut self, scene: &Scene, fonts: &FontRepository) {
        self.geometry = GeometryCache::from_scene_with_paragraph_cache(
            scene,
            &mut self.paragraph.borrow_mut(),
            fonts,
        );
    }

    /// Rebuild geometry cache with layout results and viewport context
    pub fn update_geometry_with_layout(
        &mut self,
        scene: &Scene,
        fonts: &FontRepository,
        layout_result: &crate::layout::cache::LayoutResult,
        viewport_size: crate::node::schema::Size,
    ) {
        self.geometry = GeometryCache::from_scene_with_layout(
            scene,
            &mut self.paragraph.borrow_mut(),
            fonts,
            layout_result,
            viewport_size,
        );
    }

    pub fn update_layers(&mut self, scene: &Scene) {
        self.layers = LayerList::from_scene(scene, self);
        self.layers
            .layers
            .sort_by_key(|entry| entry.layer.z_index());
        self.layer_index = RTree::new();
        for (i, entry) in self.layers.layers.iter().enumerate() {
            if let Some(rb) = self.geometry.get_render_bounds(&entry.id) {
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
        self.paragraph.borrow_mut().invalidate();
        self.path.borrow_mut().invalidate();
    }

    /// Return a picture for a specific node if cached.
    pub fn get_node_picture(&self, id: &NodeId) -> Option<&Picture> {
        self.picture.get_node_picture(id)
    }

    /// Store a picture for a node.
    pub fn set_node_picture(&mut self, id: NodeId, picture: Picture) {
        self.picture.set_node_picture(id, picture);
    }

    /// Query painter layer indices whose bounds intersect with the given rectangle.
    /// This includes layers that are:
    /// - Fully contained within the rectangle
    /// - Partially overlapping with the rectangle
    /// - Touching the rectangle's edges
    pub fn intersects(&self, rect: Rectangle) -> Vec<usize> {
        let env = AABB::from_corners(
            [rect.x, rect.y],
            [rect.x + rect.width, rect.y + rect.height],
        );
        self.layer_index
            .locate_in_envelope_intersecting(&env)
            .map(|il| il.index)
            .collect()
    }

    /// Query painter layer indices whose bounds are fully contained within the given rectangle.
    /// This only includes layers that are completely inside the rectangle, not touching its edges.
    pub fn contains(&self, rect: &Rectangle) -> Vec<usize> {
        // Get layers that are fully contained
        let env = AABB::from_corners(
            [rect.x, rect.y],
            [rect.x + rect.width, rect.y + rect.height],
        );
        self.layer_index
            .locate_in_envelope(&env)
            .map(|il| il.index)
            .collect()
    }

    /// Query painter layer indices whose bounds contain the given point.
    pub fn intersects_point(&self, point: Vector2) -> Vec<usize> {
        let env = AABB::from_point([point[0], point[1]]);
        self.layer_index
            .locate_in_envelope_intersecting(&env)
            .map(|il| il.index)
            .collect()
    }

    /// Update raster tile cache using the given camera and surface.
    pub fn update_tiles(&mut self, camera: &Camera2D, surface: &mut Surface, partial: bool) {
        let width = surface.width() as f32;
        let height = surface.height() as f32;
        let index = &self.layer_index;
        let intersects = |rect: Rectangle| {
            let env = AABB::from_corners(
                [rect.x, rect.y],
                [rect.x + rect.width, rect.y + rect.height],
            );
            index.locate_in_envelope_intersecting(&env).next().is_some()
        };
        self.tile
            .update_tiles(camera, width, height, surface, partial, intersects);
    }
}
