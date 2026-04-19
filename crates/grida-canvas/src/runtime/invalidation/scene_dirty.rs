//! [`SceneDirty`] — per-phase dirty sets populated by the classifier.
//!
//! This is the only mutable state in the invalidation module. Each
//! rendering phase has its own field (set-of-node-ids or bool).
//! [`SceneDirty::apply`] implements the classifier table — the
//! contract documented in the plan:
//!
//! | ChangeKind | layout | geometry | effect_tree | layer_list | damage |
//! | ---------- | :----: | :------: | :---------: | :--------: | :----: |
//! | None       |        |          |             |            |        |
//! | Paint      |        |          |             |            |  Full  |
//! | Geometry   |        |    id    |             |            |  Full  |
//! | Full       |   id   |    id    |     id      |     ✓      |  Full  |

use std::collections::HashSet;

use crate::node::schema::NodeId;

use super::change_kind::{ChangeKind, Damage, GlobalFlag};

/// Per-phase dirty sets.
///
/// Populated by [`SceneDirty::apply`] (per-node) and
/// [`SceneDirty::apply_global`] (orthogonal). Consumed and cleared
/// by [`crate::runtime::scene::Renderer::apply_changes`].
#[derive(Debug, Clone, Default)]
pub struct SceneDirty {
    pub layout: HashSet<NodeId>,
    pub geometry: HashSet<NodeId>,
    pub effect_tree: HashSet<NodeId>,
    pub layer_list: bool,
    pub damage: Damage,
    pub global: GlobalDirty,
    /// Union of every per-node set above. Maintained eagerly so the
    /// picture-cache / compositor invalidation loop in `apply_changes`
    /// doesn't re-union `layout ∪ geometry ∪ effect_tree` every frame.
    pub paint_touched: HashSet<NodeId>,
}

/// Orthogonal global invalidations.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct GlobalDirty {
    pub scene_load: bool,
    pub viewport_size: bool,
    pub font_loaded: bool,
    pub image_loaded: bool,
    pub config: bool,
    pub render_filter: bool,
    /// Scene-wide layout-dirty signal (see [`GlobalFlag::Layout`]).
    pub layout: bool,
}

impl SceneDirty {
    pub fn new() -> Self {
        Self::default()
    }

    /// Classify a per-node change into dirty sets.
    ///
    /// This is the one routing table the whole module revolves
    /// around. Each branch corresponds to one row of the classifier
    /// table.
    pub fn apply(&mut self, id: NodeId, kind: ChangeKind) {
        match kind {
            ChangeKind::None => {}

            ChangeKind::Paint => {
                self.damage = self.damage.merge(Damage::Full);
                self.paint_touched.insert(id);
            }

            ChangeKind::Geometry => {
                self.geometry.insert(id);
                self.damage = self.damage.merge(Damage::Full);
                self.paint_touched.insert(id);
            }

            ChangeKind::Full => {
                self.layout.insert(id);
                self.geometry.insert(id);
                self.effect_tree.insert(id);
                self.layer_list = true;
                self.damage = self.damage.merge(Damage::Full);
                self.paint_touched.insert(id);
            }
        }
    }

    /// Record a global flag.
    pub fn apply_global(&mut self, flag: GlobalFlag) {
        match flag {
            GlobalFlag::SceneLoad => self.global.scene_load = true,
            GlobalFlag::ViewportSize => self.global.viewport_size = true,
            GlobalFlag::FontLoaded => self.global.font_loaded = true,
            GlobalFlag::ImageLoaded => self.global.image_loaded = true,
            GlobalFlag::Config => self.global.config = true,
            GlobalFlag::RenderFilter => self.global.render_filter = true,
            GlobalFlag::Layout => self.global.layout = true,
        }
    }

    /// True when no changes have been recorded.
    pub fn is_empty(&self) -> bool {
        self.layout.is_empty()
            && self.geometry.is_empty()
            && self.effect_tree.is_empty()
            && !self.layer_list
            && self.damage == Damage::None
            && self.paint_touched.is_empty()
            && self.global == GlobalDirty::default()
    }

    /// True when any per-node dirty set has entries.
    pub fn has_node_changes(&self) -> bool {
        !self.layout.is_empty()
            || !self.geometry.is_empty()
            || !self.effect_tree.is_empty()
            || !self.paint_touched.is_empty()
    }

    /// True when any tree-walk phase is dirty (layout/geometry/effect/layers).
    ///
    /// Used by flush to decide whether to run the coarse
    /// `rebuild_scene_caches` path. Paint-only changes return
    /// `false` here.
    pub fn has_tree_work(&self) -> bool {
        !self.layout.is_empty()
            || !self.geometry.is_empty()
            || !self.effect_tree.is_empty()
            || self.layer_list
    }

    /// Clear all dirty state. Called by flush after a successful run.
    pub fn clear(&mut self) {
        *self = Self::default();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn none_does_nothing() {
        let mut d = SceneDirty::new();
        d.apply(1, ChangeKind::None);
        assert!(d.is_empty());
    }

    #[test]
    fn paint_sets_damage_only() {
        let mut d = SceneDirty::new();
        d.apply(1, ChangeKind::Paint);
        assert!(d.layout.is_empty());
        assert!(d.geometry.is_empty());
        assert!(d.effect_tree.is_empty());
        assert!(!d.layer_list);
        assert_eq!(d.damage, Damage::Full);
        assert!(!d.has_tree_work());
        assert!(d.has_node_changes());
    }

    #[test]
    fn geometry_sets_geometry_and_damage() {
        let mut d = SceneDirty::new();
        d.apply(1, ChangeKind::Geometry);
        assert!(d.layout.is_empty());
        assert!(d.geometry.contains(&1));
        assert!(d.effect_tree.is_empty());
        assert!(!d.layer_list);
        assert_eq!(d.damage, Damage::Full);
        assert!(d.has_tree_work());
    }

    #[test]
    fn full_sets_everything() {
        let mut d = SceneDirty::new();
        d.apply(1, ChangeKind::Full);
        assert!(d.layout.contains(&1));
        assert!(d.geometry.contains(&1));
        assert!(d.effect_tree.contains(&1));
        assert!(d.layer_list);
        assert_eq!(d.damage, Damage::Full);
    }

    #[test]
    fn clear_resets() {
        let mut d = SceneDirty::new();
        d.apply(1, ChangeKind::Full);
        d.apply_global(GlobalFlag::FontLoaded);
        assert!(!d.is_empty());
        d.clear();
        assert!(d.is_empty());
    }

    #[test]
    fn multiple_kinds_accumulate() {
        let mut d = SceneDirty::new();
        d.apply(1, ChangeKind::Geometry);
        d.apply(2, ChangeKind::Paint);
        d.apply(3, ChangeKind::Full);
        assert!(d.geometry.contains(&1));
        assert!(d.geometry.contains(&3));
        assert!(d.layout.contains(&3));
        assert!(d.paint_touched.contains(&1));
        assert!(d.paint_touched.contains(&2));
        assert!(d.paint_touched.contains(&3));
        assert_eq!(d.damage, Damage::Full);
    }

    #[test]
    fn global_flags_record() {
        let mut d = SceneDirty::new();
        d.apply_global(GlobalFlag::FontLoaded);
        d.apply_global(GlobalFlag::SceneLoad);
        assert!(d.global.font_loaded);
        assert!(d.global.scene_load);
        assert!(!d.global.image_loaded);
    }
}
