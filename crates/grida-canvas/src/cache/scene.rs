use crate::cache::compositor::LayerImageCache;
use crate::node::schema::{NodeId, Scene};
use crate::runtime::effect_tree::EffectTree;
use crate::runtime::font_repository::FontRepository;
use crate::{
    cache::{
        geometry::GeometryCache,
        paragraph::ParagraphCache,
        picture::{PictureCache, PictureCacheStrategy},
        vector_path::VectorPathCache,
    },
    painter::layer::{Layer, LayerList},
};
use math2::{rect::Rectangle, vector2::Vector2};
use rstar::{RTree, RTreeObject, AABB};
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
    /// Per-node layer compositing cache (replaces tile cache).
    pub compositor: LayerImageCache,
    /// Effect tree identifying subtrees that need render surfaces.
    /// Built from the scene graph during `update_effect_tree()`.
    pub effect_tree: EffectTree,
    pub paragraph: std::cell::RefCell<ParagraphCache>,
    pub path: std::cell::RefCell<VectorPathCache>,
    pub layer_index: RTree<IndexedLayer>,
}

impl Default for SceneCache {
    fn default() -> Self {
        Self::new()
    }
}

impl SceneCache {
    /// Create a new empty cache with the given picture cache strategy.
    pub fn new() -> Self {
        Self {
            layers: LayerList::default(),
            geometry: GeometryCache::new(),
            picture: PictureCache::new(),
            compositor: LayerImageCache::default(),
            effect_tree: EffectTree::empty(),
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
            Some(layout_result),
            viewport_size,
        );
    }

    /// Rebuild the effect tree from the scene graph.
    /// This identifies which subtrees need render surfaces for effects
    /// (opacity isolation, blend mode, blur, shadows, clip, mask).
    pub fn update_effect_tree(&mut self, scene: &Scene) {
        self.effect_tree = EffectTree::build(&scene.graph);
    }

    pub fn update_layers(&mut self, scene: &Scene) {
        self.layers = LayerList::from_scene(scene, self);
        self.layers
            .layers
            .sort_by_key(|entry| entry.layer.z_index());
        let items: Vec<IndexedLayer> = self
            .layers
            .layers
            .iter()
            .enumerate()
            .filter_map(|(i, entry)| {
                self.geometry
                    .get_render_bounds(&entry.id)
                    .map(|rb| IndexedLayer {
                        index: i,
                        bounds: AABB::from_corners(
                            [rb.x, rb.y],
                            [rb.x + rb.width, rb.y + rb.height],
                        ),
                    })
            })
            .collect();
        self.layer_index = RTree::bulk_load(items);
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
        self.compositor.invalidate_all();
    }

    /// Return a picture for a specific node if cached.
    pub fn get_node_picture(&self, id: &NodeId) -> Option<&Picture> {
        self.picture.get_node_picture(id)
    }

    /// Return a picture for a specific node in a specific render variant if cached.
    pub fn get_node_picture_variant(&self, id: &NodeId, variant_key: u64) -> Option<&Picture> {
        self.picture.get_node_picture_variant(id, variant_key)
    }

    /// Store a picture for a node.
    pub fn set_node_picture(&mut self, id: NodeId, picture: Picture) {
        self.picture.set_node_picture(id, picture);
    }

    /// Store a picture for a node in a specific render variant.
    pub fn set_node_picture_variant(&mut self, id: NodeId, variant_key: u64, picture: Picture) {
        self.picture
            .set_node_picture_variant(id, variant_key, picture);
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

    /// Return the bounding envelope of all scene content in the R-tree.
    ///
    /// O(1) — reads the cached root node envelope. Returns `None` when
    /// the scene is empty (no layers indexed).
    pub fn scene_envelope(&self) -> Option<AABB<[f32; 2]>> {
        if self.layer_index.size() == 0 {
            return None;
        }
        Some(self.layer_index.root().envelope())
    }

    /// Query painter layer indices whose bounds contain the given point.
    pub fn intersects_point(&self, point: Vector2) -> Vec<usize> {
        let env = AABB::from_point([point[0], point[1]]);
        self.layer_index
            .locate_in_envelope_intersecting(&env)
            .map(|il| il.index)
            .collect()
    }
}
