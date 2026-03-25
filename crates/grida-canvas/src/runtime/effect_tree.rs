//! Effect Tree — determines which subtrees need render surfaces.
//!
//! The effect tree is a sparse overlay on the scene graph. Most nodes pass
//! through without creating render surfaces. Only nodes whose visual properties
//! require compositing isolation produce an [`EffectNode`].
//!
//! This maps to Chromium's `EffectTree` / `EffectNode` concept. See
//! `docs/wg/research/chromium/` for background.
//!
//! # Render Surface Triggers
//!
//! A render surface is created when an effect cannot be applied per-node but
//! must be applied to the composited result of a subtree:
//!
//! - **Opacity** (< 1.0 on a node with 2+ visible children): the subtree is
//!   drawn at full opacity into an offscreen, then composited with the
//!   reduced alpha once.
//! - **Blend mode** (non-PassThrough): the subtree is isolated into an
//!   offscreen before blending with the backdrop.
//! - **Layer blur**: the blur filter is applied to the entire subtree content.
//! - **Shadows**: a render surface caches the subtree content so the shadow
//!   filter runs once (not per-child).
//! - **Clip** (container `clip=true`): children are clipped to the
//!   container's shape.
//! - **Mask**: a sibling is used as a mask for subsequent content.
//!
//! Backdrop blur and liquid glass are *context-dependent* — they read from
//! content behind them and are applied per-node by the painter, not via
//! render surfaces.
//!
//! # Usage
//!
//! ```ignore
//! let effect_tree = EffectTree::build(&scene.graph);
//! // During frame planning:
//! for (id, node) in effect_tree.iter() {
//!     // node.reason tells you WHY this subtree needs a surface
//!     // node.children are the child NodeIds to draw into the surface
//! }
//! ```

use crate::cache::fast_hash::{new_node_id_map, NodeIdHashMap};
use crate::cg::types::LayerBlendMode;
use crate::node::id::NodeId;
use crate::node::scene_graph::SceneGraph;
use crate::node::schema::NodeLayerCore;

/// Why a node needs a render surface.
///
/// Bit-flag style — a single node may trigger a surface for multiple reasons
/// (e.g. opacity < 1.0 AND has shadows). We track all reasons so the render
/// pass pipeline can apply them in the correct order.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum RenderSurfaceReason {
    /// Opacity < 1.0 on a node with 2+ visible children.
    /// The subtree is drawn at full alpha, then composited with reduced opacity.
    Opacity,
    /// Non-PassThrough blend mode.
    /// The subtree is isolated before blending with the backdrop.
    BlendMode,
    /// Active layer blur effect.
    /// The blur filter is applied to the entire composited subtree.
    LayerBlur,
    /// One or more shadow effects (drop shadow and/or inner shadow).
    /// The subtree is composited into a surface, then the shadow filter
    /// runs once on the result instead of per-child.
    Shadow,
    /// Container clips its descendants (`clip = true`).
    Clip,
    /// This node or its siblings participate in a mask group.
    Mask,
}

/// A node in the effect tree that requires a render surface.
#[derive(Debug, Clone)]
pub struct EffectNode {
    /// The scene graph node that triggers this render surface.
    pub id: NodeId,
    /// All reasons this node needs a render surface.
    /// A node may have multiple reasons (e.g. opacity + shadow).
    pub reasons: Vec<RenderSurfaceReason>,
    /// Direct children of this node in the scene graph that should be drawn
    /// into the render surface. Computed during tree construction for
    /// convenience — avoids re-querying the scene graph during frame planning.
    pub children: Vec<NodeId>,
    /// The number of visible (active) children. Used to determine whether
    /// opacity isolation is actually needed (only when >= 2).
    pub visible_child_count: usize,
}

impl EffectNode {
    /// Returns true if this effect node triggers a render surface for any reason.
    /// Always true by construction — nodes without reasons are not added to the tree.
    pub fn needs_surface(&self) -> bool {
        !self.reasons.is_empty()
    }

    /// Returns true if this node needs a surface specifically because of opacity.
    pub fn has_reason(&self, reason: RenderSurfaceReason) -> bool {
        self.reasons.contains(&reason)
    }
}

/// The effect tree — a sparse set of scene graph nodes that need render surfaces.
///
/// Only nodes that actually require compositing isolation are present.
/// The tree is rebuilt from scratch on scene changes (Phase 2). Incremental
/// updates will be added once the basic architecture proves out.
#[derive(Debug, Clone)]
pub struct EffectTree {
    /// Map from NodeId to its EffectNode data.
    /// Only contains nodes that need render surfaces.
    nodes: NodeIdHashMap<NodeId, EffectNode>,
    /// Total number of render surfaces (== nodes.len()).
    surface_count: usize,
    /// Summary statistics for diagnostics.
    stats: EffectTreeStats,
}

/// Diagnostic statistics about the effect tree.
#[derive(Debug, Clone, Default)]
pub struct EffectTreeStats {
    /// Total nodes in the scene graph that were visited.
    pub nodes_visited: usize,
    /// Number of nodes that need render surfaces.
    pub surfaces: usize,
    /// Breakdown by reason.
    pub by_reason: ReasonCounts,
}

/// Per-reason counts for diagnostics.
#[derive(Debug, Clone, Default)]
pub struct ReasonCounts {
    pub opacity: usize,
    pub blend_mode: usize,
    pub layer_blur: usize,
    pub shadow: usize,
    pub clip: usize,
    pub mask: usize,
}

impl EffectTree {
    /// Create an empty effect tree (no render surfaces).
    pub fn empty() -> Self {
        Self {
            nodes: new_node_id_map(),
            surface_count: 0,
            stats: EffectTreeStats::default(),
        }
    }

    /// Build the effect tree from a scene graph.
    ///
    /// Walks the entire scene graph and identifies nodes that need render
    /// surfaces. This is a full rebuild — no incremental state is carried
    /// over.
    pub fn build(graph: &SceneGraph) -> Self {
        let mut nodes = new_node_id_map();
        let mut stats = EffectTreeStats::default();

        for root_id in graph.roots() {
            Self::visit(graph, root_id, &mut nodes, &mut stats);
        }

        stats.surfaces = nodes.len();
        let surface_count = nodes.len();

        Self {
            nodes,
            surface_count,
            stats,
        }
    }

    /// Recursive visitor that checks each node for render surface triggers.
    ///
    /// Uses `layer_core` (compact ~16-byte struct) for all visibility, opacity,
    /// blend mode, and mask checks — never touches the full 500+ byte `Node`
    /// enum unless the node has effects that need detail inspection.
    fn visit(
        graph: &SceneGraph,
        id: &NodeId,
        nodes: &mut NodeIdHashMap<NodeId, EffectNode>,
        stats: &mut EffectTreeStats,
    ) {
        stats.nodes_visited += 1;

        // Read from compact layer_core (~16 bytes) instead of full Node (~500 bytes).
        let lc = match graph.get_layer_core(id) {
            Some(lc) => *lc,
            None => return,
        };

        // Skip inactive nodes — they produce no visual output.
        if !lc.active {
            return;
        }

        let all_children = graph.get_children(id);
        let all_children_slice = all_children.map(|c| c.as_slice()).unwrap_or(&[]);

        // Count visible children using layer_core (no full Node touch).
        let layer_core_map = graph.layer_core();
        let visible_child_count = all_children_slice
            .iter()
            .filter(|cid| {
                layer_core_map
                    .get(cid)
                    .map(|c| c.active)
                    .unwrap_or(false)
            })
            .count();

        // Collect render surface reasons using layer_core for fast checks.
        // Only access full Node when effects detail is needed.
        let reasons = Self::classify_from_core(id, &lc, visible_child_count, all_children_slice, graph);

        if !reasons.is_empty() {
            for reason in &reasons {
                match reason {
                    RenderSurfaceReason::Opacity => stats.by_reason.opacity += 1,
                    RenderSurfaceReason::BlendMode => stats.by_reason.blend_mode += 1,
                    RenderSurfaceReason::LayerBlur => stats.by_reason.layer_blur += 1,
                    RenderSurfaceReason::Shadow => stats.by_reason.shadow += 1,
                    RenderSurfaceReason::Clip => stats.by_reason.clip += 1,
                    RenderSurfaceReason::Mask => stats.by_reason.mask += 1,
                }
            }

            // Only allocate the children Vec for nodes that actually need a surface.
            let active_children: Vec<NodeId> = all_children_slice
                .iter()
                .filter(|cid| {
                    layer_core_map
                        .get(cid)
                        .map(|c| c.active)
                        .unwrap_or(false)
                })
                .copied()
                .collect();

            nodes.insert(
                *id,
                EffectNode {
                    id: *id,
                    reasons,
                    children: active_children,
                    visible_child_count,
                },
            );
        }

        // Recurse into all children (including inactive ones, which will
        // early-return in visit) so the full tree is traversed.
        for child_id in all_children_slice {
            Self::visit(graph, child_id, nodes, stats);
        }
    }

    /// Classify a node using `NodeLayerCore` for fast-path checks.
    ///
    /// Only accesses the full `Node` when the node has effects (blur/shadows)
    /// that need detail inspection. For the majority of nodes (no effects),
    /// this never touches the 500+ byte Node enum.
    fn classify_from_core(
        id: &NodeId,
        lc: &NodeLayerCore,
        visible_child_count: usize,
        children: &[NodeId],
        graph: &SceneGraph,
    ) -> Vec<RenderSurfaceReason> {
        let mut reasons = Vec::new();

        // --- Opacity isolation ---
        if lc.opacity < 1.0 && visible_child_count >= 2 {
            reasons.push(RenderSurfaceReason::Opacity);
        }

        // --- Blend mode isolation ---
        if lc.blend_mode != LayerBlendMode::PassThrough && visible_child_count >= 1 {
            reasons.push(RenderSurfaceReason::BlendMode);
        }

        // --- Effects that benefit from render surfaces ---
        // Only access full Node when has_effects is true (minority of nodes).
        if lc.has_effects && visible_child_count >= 1 {
            if let Ok(node) = graph.get_node(id) {
                if let Some(effects) = node.effects() {
                    if effects.blur.as_ref().is_some_and(|b| b.active) {
                        reasons.push(RenderSurfaceReason::LayerBlur);
                    }
                    if !effects.shadows.is_empty() {
                        reasons.push(RenderSurfaceReason::Shadow);
                    }
                }
            }
        }

        // --- Clip ---
        if lc.clips_content && visible_child_count >= 1 {
            reasons.push(RenderSurfaceReason::Clip);
        }

        // --- Mask groups ---
        // Check children's mask from layer_core (no full Node needed).
        if Self::has_mask_children_from_core(children, graph) {
            reasons.push(RenderSurfaceReason::Mask);
        }

        reasons
    }

    /// Check if any of the given children are active mask nodes using layer_core.
    fn has_mask_children_from_core(children: &[NodeId], graph: &SceneGraph) -> bool {
        let layer_core_map = graph.layer_core();
        children.iter().any(|cid| {
            layer_core_map
                .get(cid)
                .map(|c| c.active && c.mask.is_some())
                .unwrap_or(false)
        })
    }

    // --- Public API ---

    /// Returns the EffectNode for a given NodeId, if it needs a render surface.
    pub fn get(&self, id: &NodeId) -> Option<&EffectNode> {
        self.nodes.get(id)
    }

    /// Returns true if the given node needs a render surface.
    pub fn needs_surface(&self, id: &NodeId) -> bool {
        self.nodes.contains_key(id)
    }

    /// Returns the total number of render surfaces in the tree.
    pub fn surface_count(&self) -> usize {
        self.surface_count
    }

    /// Iterate over all effect nodes.
    pub fn iter(&self) -> impl Iterator<Item = (&NodeId, &EffectNode)> {
        self.nodes.iter()
    }

    /// Returns diagnostic statistics about the effect tree.
    pub fn stats(&self) -> &EffectTreeStats {
        &self.stats
    }

    /// Returns true if the tree is empty (no render surfaces needed).
    pub fn is_empty(&self) -> bool {
        self.nodes.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cg::fe::{FeBlur, FeGaussianBlur, FeShadow};
    use crate::cg::prelude::*;
    use crate::node::schema::*;
    use math2::transform::AffineTransform;

    /// Helper: create a minimal rectangle node.
    fn rect_node() -> Node {
        Node::Rectangle(RectangleNodeRec {
            active: true,
            opacity: 1.0,
            blend_mode: LayerBlendMode::PassThrough,
            mask: None,
            transform: AffineTransform::identity(),
            size: Size {
                width: 100.0,
                height: 100.0,
            },
            corner_radius: RectangularCornerRadius::default(),
            corner_smoothing: CornerSmoothing::default(),
            fills: Paints::default(),
            strokes: Paints::default(),
            stroke_style: StrokeStyle::default(),
            stroke_width: StrokeWidth::default(),
            effects: LayerEffects::default(),
            layout_child: None,
        })
    }

    /// Helper: create a container node with given properties.
    fn container_node(opacity: f32, blend_mode: LayerBlendMode, clip: bool) -> Node {
        Node::Container(ContainerNodeRec {
            active: true,
            opacity,
            blend_mode,
            mask: None,
            rotation: 0.0,
            position: LayoutPositioningBasis::default(),
            layout_container: LayoutContainerStyle::default(),
            layout_dimensions: LayoutDimensionStyle::default(),
            layout_child: None,
            corner_radius: RectangularCornerRadius::default(),
            corner_smoothing: CornerSmoothing::default(),
            fills: Paints::default(),
            strokes: Paints::default(),
            stroke_style: StrokeStyle::default(),
            stroke_width: StrokeWidth::default(),
            effects: LayerEffects::default(),
            clip,
        })
    }

    /// Helper: create a container node with effects.
    fn container_with_effects(effects: LayerEffects) -> Node {
        Node::Container(ContainerNodeRec {
            active: true,
            opacity: 1.0,
            blend_mode: LayerBlendMode::PassThrough,
            mask: None,
            rotation: 0.0,
            position: LayoutPositioningBasis::default(),
            layout_container: LayoutContainerStyle::default(),
            layout_dimensions: LayoutDimensionStyle::default(),
            layout_child: None,
            corner_radius: RectangularCornerRadius::default(),
            corner_smoothing: CornerSmoothing::default(),
            fills: Paints::default(),
            strokes: Paints::default(),
            stroke_style: StrokeStyle::default(),
            stroke_width: StrokeWidth::default(),
            effects,
            clip: false,
        })
    }

    /// Helper: create a group node.
    fn group_node(opacity: f32, blend_mode: LayerBlendMode) -> Node {
        Node::Group(GroupNodeRec {
            active: true,
            opacity,
            blend_mode,
            mask: None,
            transform: None,
        })
    }

    /// Helper: create a rect node that acts as a mask.
    fn mask_rect_node() -> Node {
        Node::Rectangle(RectangleNodeRec {
            active: true,
            opacity: 1.0,
            blend_mode: LayerBlendMode::PassThrough,
            mask: Some(LayerMaskType::Geometry),
            transform: AffineTransform::identity(),
            size: Size {
                width: 100.0,
                height: 100.0,
            },
            corner_radius: RectangularCornerRadius::default(),
            corner_smoothing: CornerSmoothing::default(),
            fills: Paints::default(),
            strokes: Paints::default(),
            stroke_style: StrokeStyle::default(),
            stroke_width: StrokeWidth::default(),
            effects: LayerEffects::default(),
            layout_child: None,
        })
    }

    /// Helper: create an inactive rect node.
    fn inactive_rect_node() -> Node {
        let mut n = rect_node();
        if let Node::Rectangle(ref mut r) = n {
            r.active = false;
        }
        n
    }

    // --- Test: Empty scene ---

    #[test]
    fn empty_scene() {
        let graph = SceneGraph::new();
        let tree = EffectTree::build(&graph);
        assert!(tree.is_empty());
        assert_eq!(tree.surface_count(), 0);
    }

    // --- Test: Flat scene, no effects ---

    #[test]
    fn flat_rects_no_surfaces() {
        let mut graph = SceneGraph::new();
        let root = graph.append_child(
            container_node(1.0, LayerBlendMode::PassThrough, false),
            crate::node::scene_graph::Parent::Root,
        );
        for _ in 0..5 {
            graph.append_child(
                rect_node(),
                crate::node::scene_graph::Parent::NodeId(root),
            );
        }

        let tree = EffectTree::build(&graph);
        assert!(tree.is_empty());
        assert_eq!(tree.stats().nodes_visited, 6);
    }

    // --- Test: Opacity with single child (no surface) ---

    #[test]
    fn opacity_single_child_no_surface() {
        let mut graph = SceneGraph::new();
        let parent = graph.append_child(
            group_node(0.5, LayerBlendMode::PassThrough),
            crate::node::scene_graph::Parent::Root,
        );
        graph.append_child(
            rect_node(),
            crate::node::scene_graph::Parent::NodeId(parent),
        );

        let tree = EffectTree::build(&graph);
        // Single visible child — opacity can be applied directly, no surface.
        assert!(!tree.needs_surface(&parent));
    }

    // --- Test: Opacity with multiple children (needs surface) ---

    #[test]
    fn opacity_multiple_children_needs_surface() {
        let mut graph = SceneGraph::new();
        let parent = graph.append_child(
            group_node(0.5, LayerBlendMode::PassThrough),
            crate::node::scene_graph::Parent::Root,
        );
        graph.append_child(
            rect_node(),
            crate::node::scene_graph::Parent::NodeId(parent),
        );
        graph.append_child(
            rect_node(),
            crate::node::scene_graph::Parent::NodeId(parent),
        );

        let tree = EffectTree::build(&graph);
        assert!(tree.needs_surface(&parent));
        let effect = tree.get(&parent).unwrap();
        assert!(effect.has_reason(RenderSurfaceReason::Opacity));
        assert_eq!(effect.visible_child_count, 2);
    }

    // --- Test: Opacity with inactive children (counts only active) ---

    #[test]
    fn opacity_inactive_children_not_counted() {
        let mut graph = SceneGraph::new();
        let parent = graph.append_child(
            group_node(0.5, LayerBlendMode::PassThrough),
            crate::node::scene_graph::Parent::Root,
        );
        graph.append_child(
            rect_node(),
            crate::node::scene_graph::Parent::NodeId(parent),
        );
        graph.append_child(
            inactive_rect_node(),
            crate::node::scene_graph::Parent::NodeId(parent),
        );

        let tree = EffectTree::build(&graph);
        // Only 1 visible child — no surface needed.
        assert!(!tree.needs_surface(&parent));
    }

    // --- Test: Blend mode isolation ---

    #[test]
    fn blend_mode_needs_surface() {
        let mut graph = SceneGraph::new();
        let parent = graph.append_child(
            group_node(1.0, LayerBlendMode::Blend(BlendMode::Multiply)),
            crate::node::scene_graph::Parent::Root,
        );
        graph.append_child(
            rect_node(),
            crate::node::scene_graph::Parent::NodeId(parent),
        );

        let tree = EffectTree::build(&graph);
        assert!(tree.needs_surface(&parent));
        let effect = tree.get(&parent).unwrap();
        assert!(effect.has_reason(RenderSurfaceReason::BlendMode));
    }

    // --- Test: Blend mode PassThrough (no surface) ---

    #[test]
    fn passthrough_blend_no_surface() {
        let mut graph = SceneGraph::new();
        let parent = graph.append_child(
            group_node(1.0, LayerBlendMode::PassThrough),
            crate::node::scene_graph::Parent::Root,
        );
        graph.append_child(
            rect_node(),
            crate::node::scene_graph::Parent::NodeId(parent),
        );

        let tree = EffectTree::build(&graph);
        assert!(!tree.needs_surface(&parent));
    }

    // --- Test: Layer blur on container ---

    #[test]
    fn layer_blur_needs_surface() {
        let effects = LayerEffects::new().blur(FeBlur::Gaussian(FeGaussianBlur { radius: 10.0 }));
        let mut graph = SceneGraph::new();
        let parent = graph.append_child(
            container_with_effects(effects),
            crate::node::scene_graph::Parent::Root,
        );
        graph.append_child(
            rect_node(),
            crate::node::scene_graph::Parent::NodeId(parent),
        );

        let tree = EffectTree::build(&graph);
        assert!(tree.needs_surface(&parent));
        let effect = tree.get(&parent).unwrap();
        assert!(effect.has_reason(RenderSurfaceReason::LayerBlur));
    }

    // --- Test: Shadow on container ---

    #[test]
    fn shadow_container_needs_surface() {
        let effects = LayerEffects::new().drop_shadow(FeShadow {
            dx: 0.0,
            dy: 4.0,
            blur: 8.0,
            spread: 0.0,
            color: CGColor::from_rgb(0, 0, 0),
            active: true,
        });
        let mut graph = SceneGraph::new();
        let parent = graph.append_child(
            container_with_effects(effects),
            crate::node::scene_graph::Parent::Root,
        );
        graph.append_child(
            rect_node(),
            crate::node::scene_graph::Parent::NodeId(parent),
        );

        let tree = EffectTree::build(&graph);
        assert!(tree.needs_surface(&parent));
        let effect = tree.get(&parent).unwrap();
        assert!(effect.has_reason(RenderSurfaceReason::Shadow));
    }

    // --- Test: Shadow on leaf (no surface — painter handles directly) ---

    #[test]
    fn shadow_leaf_no_surface() {
        let mut graph = SceneGraph::new();
        let leaf = {
            let mut node = rect_node();
            if let Node::Rectangle(ref mut r) = node {
                r.effects = LayerEffects::new().drop_shadow(FeShadow {
                    dx: 0.0,
                    dy: 4.0,
                    blur: 8.0,
                    spread: 0.0,
                    color: CGColor::from_rgb(0, 0, 0),
                    active: true,
                });
            }
            graph.append_child(node, crate::node::scene_graph::Parent::Root)
        };

        let tree = EffectTree::build(&graph);
        // Leaf node — painter draws shadow directly, no surface needed.
        assert!(!tree.needs_surface(&leaf));
    }

    // --- Test: Clip container ---

    #[test]
    fn clip_container_needs_surface() {
        let mut graph = SceneGraph::new();
        let parent = graph.append_child(
            container_node(1.0, LayerBlendMode::PassThrough, true),
            crate::node::scene_graph::Parent::Root,
        );
        graph.append_child(
            rect_node(),
            crate::node::scene_graph::Parent::NodeId(parent),
        );

        let tree = EffectTree::build(&graph);
        assert!(tree.needs_surface(&parent));
        let effect = tree.get(&parent).unwrap();
        assert!(effect.has_reason(RenderSurfaceReason::Clip));
    }

    // --- Test: Mask group ---

    #[test]
    fn mask_child_triggers_surface() {
        let mut graph = SceneGraph::new();
        let parent = graph.append_child(
            group_node(1.0, LayerBlendMode::PassThrough),
            crate::node::scene_graph::Parent::Root,
        );
        graph.append_child(
            rect_node(),
            crate::node::scene_graph::Parent::NodeId(parent),
        );
        graph.append_child(
            mask_rect_node(),
            crate::node::scene_graph::Parent::NodeId(parent),
        );

        let tree = EffectTree::build(&graph);
        assert!(tree.needs_surface(&parent));
        let effect = tree.get(&parent).unwrap();
        assert!(effect.has_reason(RenderSurfaceReason::Mask));
    }

    // --- Test: Multiple reasons on same node ---

    #[test]
    fn multiple_reasons() {
        let effects = LayerEffects::new()
            .blur(FeBlur::Gaussian(FeGaussianBlur { radius: 5.0 }))
            .drop_shadow(FeShadow {
                dx: 0.0,
                dy: 4.0,
                blur: 8.0,
                spread: 0.0,
                color: CGColor::from_rgb(0, 0, 0),
                active: true,
            });
        let mut node = container_with_effects(effects);
        if let Node::Container(ref mut c) = node {
            c.opacity = 0.5;
            c.clip = true;
        }

        let mut graph = SceneGraph::new();
        let parent = graph.append_child(node, crate::node::scene_graph::Parent::Root);
        graph.append_child(
            rect_node(),
            crate::node::scene_graph::Parent::NodeId(parent),
        );
        graph.append_child(
            rect_node(),
            crate::node::scene_graph::Parent::NodeId(parent),
        );

        let tree = EffectTree::build(&graph);
        assert!(tree.needs_surface(&parent));
        let effect = tree.get(&parent).unwrap();
        assert!(effect.has_reason(RenderSurfaceReason::Opacity));
        assert!(effect.has_reason(RenderSurfaceReason::LayerBlur));
        assert!(effect.has_reason(RenderSurfaceReason::Shadow));
        assert!(effect.has_reason(RenderSurfaceReason::Clip));
        assert_eq!(effect.reasons.len(), 4);
    }

    // --- Test: Deep nesting ---

    #[test]
    fn nested_surfaces() {
        let mut graph = SceneGraph::new();

        // Root group with opacity
        let root = graph.append_child(
            group_node(0.5, LayerBlendMode::PassThrough),
            crate::node::scene_graph::Parent::Root,
        );

        // Inner container with clip
        let inner = graph.append_child(
            container_node(1.0, LayerBlendMode::PassThrough, true),
            crate::node::scene_graph::Parent::NodeId(root),
        );

        // Two children under each
        graph.append_child(
            rect_node(),
            crate::node::scene_graph::Parent::NodeId(root),
        );
        graph.append_child(
            rect_node(),
            crate::node::scene_graph::Parent::NodeId(inner),
        );

        let tree = EffectTree::build(&graph);

        // Root needs surface for opacity (2 visible children: inner + rect).
        assert!(tree.needs_surface(&root));
        assert!(tree.get(&root).unwrap().has_reason(RenderSurfaceReason::Opacity));

        // Inner needs surface for clip (1 visible child).
        assert!(tree.needs_surface(&inner));
        assert!(tree
            .get(&inner)
            .unwrap()
            .has_reason(RenderSurfaceReason::Clip));

        assert_eq!(tree.surface_count(), 2);
    }

    // --- Test: Stats are accurate ---

    #[test]
    fn stats_accuracy() {
        let mut graph = SceneGraph::new();
        let parent = graph.append_child(
            container_node(0.5, LayerBlendMode::PassThrough, true),
            crate::node::scene_graph::Parent::Root,
        );
        graph.append_child(
            rect_node(),
            crate::node::scene_graph::Parent::NodeId(parent),
        );
        graph.append_child(
            rect_node(),
            crate::node::scene_graph::Parent::NodeId(parent),
        );

        let tree = EffectTree::build(&graph);
        let stats = tree.stats();
        assert_eq!(stats.nodes_visited, 3);
        assert_eq!(stats.surfaces, 1);
        assert_eq!(stats.by_reason.opacity, 1);
        assert_eq!(stats.by_reason.clip, 1);
    }

    // --- Test: Leaf-only scene (no surfaces) ---

    #[test]
    fn leaf_only_no_surfaces() {
        let mut graph = SceneGraph::new();
        graph.append_child(rect_node(), crate::node::scene_graph::Parent::Root);
        graph.append_child(rect_node(), crate::node::scene_graph::Parent::Root);
        graph.append_child(rect_node(), crate::node::scene_graph::Parent::Root);

        let tree = EffectTree::build(&graph);
        assert!(tree.is_empty());
    }
}
