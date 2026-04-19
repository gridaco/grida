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
use std::collections::{HashMap, HashSet};

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

/// Build an `rstar` AABB from a `math2::rect::Rectangle`. Used
/// wherever the R-tree ingests render bounds.
#[inline]
fn aabb_from_rect(r: &Rectangle) -> AABB<[f32; 2]> {
    AABB::from_corners([r.x, r.y], [r.x + r.width, r.y + r.height])
}

/// Per-id reverse index for the `layers` Vec and the R-tree.
///
/// Populated alongside [`SceneCache::update_layers`]. Two pieces of
/// state travel together:
/// - `layer_idx` — position in `SceneCache::layers.layers`
/// - `rtree_bounds` — AABB last inserted into `SceneCache::layer_index`
///   (rstar needs an exact geometry match to remove)
///
/// Nodes whose layer exists but has no render bounds (rare — not
/// currently produced by `from_scene`) carry `rtree_bounds = None`.
#[derive(Debug, Clone, Copy)]
struct LayerIndexEntry {
    layer_idx: usize,
    rtree_bounds: Option<AABB<[f32; 2]>>,
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
    /// `node_id → (position in layers Vec, R-tree AABB)`. Kept in
    /// sync with `layers` and `layer_index`; invariant enforced by
    /// [`Self::update_layers`] / [`Self::rebuild_layer_vec`] /
    /// [`Self::patch_layers_for_subtree`]. Private on purpose —
    /// external writers would silently desync the R-tree.
    layer_by_id: HashMap<NodeId, LayerIndexEntry>,
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
            layer_by_id: HashMap::new(),
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

    /// Partial geometry update: re-resolve only the subtrees rooted
    /// at `roots` and leave all other entries untouched.
    ///
    /// Wraps [`GeometryCache::update_subtree`]; returns the set of
    /// ids whose entries were patched. The caller can feed that set
    /// directly to [`Self::patch_layers_for_subtree`] to keep the
    /// layer list and R-tree in sync.
    pub fn update_geometry_for_subtree(
        &mut self,
        roots: &HashSet<NodeId>,
        scene: &Scene,
        fonts: &FontRepository,
        layout_result: Option<&crate::layout::cache::LayoutResult>,
        viewport_size: crate::node::schema::Size,
    ) -> HashSet<NodeId> {
        self.geometry.update_subtree(
            roots,
            scene,
            &mut self.paragraph.borrow_mut(),
            fonts,
            layout_result,
            viewport_size,
        )
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
        self.rebuild_layer_side_maps_and_rtree();
    }

    /// Repopulate `layer_by_id` and rebuild the R-tree from the
    /// current `layers` Vec and `geometry`. Shared by the full
    /// `update_layers` path and any future paint-style rebuild that
    /// also wants the R-tree refreshed.
    fn rebuild_layer_side_maps_and_rtree(&mut self) {
        self.layer_by_id.clear();
        self.layer_by_id.reserve(self.layers.layers.len());
        let mut items: Vec<IndexedLayer> = Vec::with_capacity(self.layers.layers.len());
        for (i, entry) in self.layers.layers.iter().enumerate() {
            let rtree_bounds = self.geometry.get_render_bounds(&entry.id).map(|rb| {
                let aabb = aabb_from_rect(&rb);
                items.push(IndexedLayer {
                    index: i,
                    bounds: aabb,
                });
                aabb
            });
            self.layer_by_id.insert(
                entry.id,
                LayerIndexEntry {
                    layer_idx: i,
                    rtree_bounds,
                },
            );
        }
        self.layer_index = RTree::bulk_load(items);
    }

    /// Rebuild the full [`LayerList`] (layers + render commands) from
    /// the scene, preserving the existing R-tree (`layer_index`).
    ///
    /// Not subtree-scoped — this still walks every node in the
    /// scene. Used for `ChangeKind::Paint`, where cached paint fields
    /// on `PainterPictureLayer` (`fills`, `strokes`, `opacity`,
    /// `blend_mode`, `effects`, `shape`, `stroke_path`, …) must be
    /// refreshed and the Painter reads from `LayerList.commands`,
    /// which owns cloned layers.
    ///
    /// A proper subtree-scoped Paint rebuild (splicing affected
    /// entries back into both `layers` and the nested `commands`
    /// graph) is future work.
    ///
    /// The R-tree can stay because:
    /// - Layer-Vec positions are stable: `LayerList::from_scene`
    ///   produces deterministic z-order from DFS insertion.
    /// - Bounds are invariant under Paint (bounds live in the motion
    ///   / effects categories, not Paint).
    pub fn rebuild_layer_vec(&mut self, scene: &Scene) {
        self.layers = LayerList::from_scene(scene, self);
        self.layers
            .layers
            .sort_by_key(|entry| entry.layer.z_index());
        // Refresh `layer_idx` only. `rtree_bounds` stays correct
        // because Paint doesn't move bounds, and layer-Vec positions
        // are stable under `from_scene`.
        for (i, entry) in self.layers.layers.iter().enumerate() {
            if let Some(e) = self.layer_by_id.get_mut(&entry.id) {
                e.layer_idx = i;
            } else {
                // Shouldn't happen — Paint doesn't add/remove layers.
                // Fall back to full rebuild to stay correct.
                self.rebuild_layer_side_maps_and_rtree();
                return;
            }
        }
    }

    /// Partial update: patch `layer.base.transform` and the R-tree
    /// entry for every node in `affected` — do **not** rebuild the
    /// full `LayerList` or re-bulk-load the R-tree.
    ///
    /// Callers must:
    /// 1. Ensure `affected` contains the *subtree* of every dirty
    ///    root (world transforms of descendants depend on their
    ///    ancestors, so every descendant must be patched too).
    /// 2. Update `self.geometry` BEFORE calling this method so that
    ///    `get_world_transform` / `get_render_bounds` return the new
    ///    values.
    ///
    /// Ignores ids not present in `layer_by_id` (e.g. non-drawing
    /// container roots whose own layer is absent).
    pub fn patch_layers_for_subtree(&mut self, affected: &HashSet<NodeId>) {
        for &id in affected {
            let Some(slot) = self.layer_by_id.get(&id).copied() else {
                continue;
            };
            let Some(entry) = self.layers.layers.get_mut(slot.layer_idx) else {
                continue;
            };

            // Patch cached world transform.
            if let Some(new_world) = self.geometry.get_world_transform(&id) {
                entry.layer.base_mut().transform = new_world;
            }

            // Patch R-tree entry: remove+insert only if bounds actually
            // changed.
            let new_aabb = self
                .geometry
                .get_render_bounds(&id)
                .map(|rb| aabb_from_rect(&rb));
            if slot.rtree_bounds == new_aabb {
                continue;
            }
            if let Some(old) = slot.rtree_bounds {
                self.layer_index.remove(&IndexedLayer {
                    index: slot.layer_idx,
                    bounds: old,
                });
            }
            if let Some(aabb) = new_aabb {
                self.layer_index.insert(IndexedLayer {
                    index: slot.layer_idx,
                    bounds: aabb,
                });
            }
            self.layer_by_id.insert(
                id,
                LayerIndexEntry {
                    layer_idx: slot.layer_idx,
                    rtree_bounds: new_aabb,
                },
            );
        }
    }

    /// Whether [`update_layers`] / [`rebuild_layer_vec`] has populated
    /// the per-id reverse index. Partial-update paths use this as a
    /// precondition check — if the cache hasn't been primed by a full
    /// build yet, they must fall back to the full path.
    pub fn has_layer_index(&self) -> bool {
        !self.layer_by_id.is_empty()
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
        let env = aabb_from_rect(&rect);
        self.layer_index
            .locate_in_envelope_intersecting(&env)
            .map(|il| il.index)
            .collect()
    }

    /// Query painter layer indices whose bounds are fully contained within the given rectangle.
    /// This only includes layers that are completely inside the rectangle, not touching its edges.
    pub fn contains(&self, rect: &Rectangle) -> Vec<usize> {
        let env = aabb_from_rect(rect);
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
