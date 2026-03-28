//! Layout Engine
//!
//! Computes layout for every node in the scene graph using Taffy (CSS-like
//! flexbox/block layout). Produces a [`LayoutResult`] consumed by the geometry
//! phase.
//!
//! # Node categories
//!
//! Nodes fall into two categories with respect to layout:
//!
//! | Category | Examples | Taffy participation |
//! |---|---|---|
//! | **Layout nodes** | Container, Rectangle, TextSpan, … | Yes — get a Taffy style via `node_to_taffy_style()` |
//! | **Virtual grouping nodes** | Group, BooleanOperation | No — excluded from the Taffy tree |
//!
//! Virtual grouping nodes are organisational: they have no intrinsic size (bounds
//! derived from children), don't constrain or flow children, and don't clip.
//! They receive a manual layout result from their schema (position + size).
//! Their layout-capable children form **independent Taffy subtrees**, each
//! computed separately.
//!
//! The predicate [`LayoutEngine::is_layout_node()`] is the single source of
//! truth for this distinction.
//!
//! # Two-phase flow
//!
//! ```text
//! build_taffy_subtree()          extract_all_layouts()
//! ─────────────────────          ──────────────────────
//! Walk scene graph top-down.     Walk scene graph top-down.
//! ● Layout node → create         ● In Taffy → use computed layout
//!   Taffy node with style.         (with schema-position fix for
//! ● Virtual grouping node →          Taffy roots, see below).
//!   skip, but recurse children   ● Not in Taffy (virtual grouping)
//!   and collect Taffy-capable      → manual layout from schema.
//!   subtree roots (extra_roots).
//! ```
//!
//! # Schema-position correction
//!
//! Taffy computes every tree root at (0, 0) because roots have no containing
//! block. Two kinds of nodes are Taffy roots and need their schema position
//! restored in `extract_all_layouts()`:
//!
//! 1. **Graph roots** — top-level nodes on the infinite canvas.
//! 2. **Children of virtual grouping nodes** — independent Taffy subtrees
//!    discovered under Group / BooleanOperation parents.
//!
//! Detection is stateless: check `graph.is_root()` **or** whether the parent
//! is a virtual grouping node (`!is_layout_node(parent)`). This handles
//! arbitrary nesting depth (Group → Group → Container) with no extra
//! bookkeeping.
//!
//! # Pipeline guarantees
//!
//! - Every node gets a layout result (computed or manual).
//! - Root / virtual-group-child positions are corrected to schema positions.
//! - Results are complete before the geometry phase begins.
//! - Missing results indicate a bug in the layout engine.

use crate::layout::cache::LayoutResult;
use crate::layout::tree::{
    AttributedTextMeasureContext, LayoutTree, TextMeasureContext, TextMeasureProvider,
};
use crate::layout::ComputedLayout;
use crate::node::scene_graph::SceneGraph;
use crate::node::schema::{Node, NodeId, NodeRectMixin, NodeTypeTag, Size};
use taffy::prelude::*;

/// Layout engine for the scene graph.
///
/// Owns the Taffy integration ([`LayoutTree`]) and caches results between
/// frames. Layout nodes get Taffy-computed positions; virtual grouping nodes
/// (Group, BooleanOperation) get manual schema-based results. See the module
/// docs for the full design.
pub struct LayoutEngine {
    tree: LayoutTree,
    result: LayoutResult,
}

impl LayoutEngine {
    pub fn new() -> Self {
        Self {
            tree: LayoutTree::new(),
            result: LayoutResult::new(),
        }
    }

    /// Compute layouts for all nodes in the scene
    ///
    /// This universal approach processes all node types without switch-case logic.
    /// Each root node is laid out independently, supporting both ICB and non-ICB scenarios.
    pub fn compute(
        &mut self,
        scene: &crate::node::schema::Scene,
        viewport_size: Size,
        mut text_measure: Option<TextMeasureProvider<'_>>,
    ) -> &LayoutResult {
        // Clear previous state and pre-allocate for the new scene size.
        // HashMap::clear() preserves capacity, so subsequent calls with
        // similar-sized scenes pay no allocation cost. The reserve() calls
        // only allocate when the new scene exceeds prior capacity.
        self.tree.clear();
        self.result.clear();

        let graph = &scene.graph;
        let node_count = graph.node_count();
        self.tree.reserve(node_count);
        self.result.reserve(node_count);

        let roots: Vec<NodeId> = graph.roots().to_vec();

        // Build and compute layout for each root subtree
        for root_id in &roots {
            let mut extra_roots = Vec::new();
            if let Some(root_taffy_id) =
                self.build_taffy_subtree(root_id, graph, viewport_size, &mut extra_roots)
            {
                // Compute layout with viewport as available space
                let _ = self.tree.compute_layout(
                    root_taffy_id,
                    taffy::Size {
                        width: AvailableSpace::Definite(viewport_size.width),
                        height: AvailableSpace::Definite(viewport_size.height),
                    },
                    text_measure.as_mut(),
                );
            }

            // Compute layout for Taffy subtrees discovered under non-layout
            // parents (e.g. Containers nested under Group/BooleanOperation).
            for extra_taffy_id in &extra_roots {
                let _ = self.tree.compute_layout(
                    *extra_taffy_id,
                    taffy::Size {
                        width: AvailableSpace::Definite(viewport_size.width),
                        height: AvailableSpace::Definite(viewport_size.height),
                    },
                    text_measure.as_mut(),
                );
            }

            // Extract layouts for ALL nodes in the subtree.
            // Nodes in the Taffy tree get computed layouts; non-Taffy nodes
            // (Group, BoolOp) get manual layout results from schema data.
            // Children of non-Taffy parents get schema-position correction
            // via parent-type check (no extra bookkeeping needed).
            // Text nodes not in Taffy are measured on-the-fly if they lack
            // explicit height in the schema.
            self.extract_all_layouts(root_id, graph, &mut text_measure);
        }

        &self.result
    }

    /// Produce layout results directly from schema positions and sizes,
    /// bypassing the Taffy layout engine entirely.
    ///
    /// This is a fast path for documents where all nodes are absolutely
    /// positioned (e.g. Figma imports without auto-layout). Each node's
    /// schema position and size are copied verbatim into the layout result.
    ///
    /// Only nodes reachable from the scene's roots are included (same
    /// scope as the full Taffy path).
    pub fn compute_schema_only(&mut self, scene: &crate::node::schema::Scene) -> &LayoutResult {
        self.result.clear();
        let graph = &scene.graph;
        let node_count = graph.node_count();
        self.result.reserve(node_count);

        let roots: Vec<NodeId> = graph.roots().to_vec();
        for root_id in &roots {
            self.extract_schema_only_recursive(root_id, graph);
        }
        &self.result
    }

    /// Recursively extract schema positions/sizes for a node and its children.
    ///
    /// Uses `NodeGeoData` (~48 bytes) instead of full `Node` (~500+ bytes) to
    /// read schema positions and sizes — avoids 136K full-Node reads.
    fn extract_schema_only_recursive(
        &mut self,
        id: &NodeId,
        graph: &crate::node::scene_graph::SceneGraph,
    ) {
        if let Some(geo) = graph.geo_data().get(id) {
            let x = geo.schema_transform.x();
            let y = geo.schema_transform.y();
            self.result.insert(
                *id,
                ComputedLayout {
                    x,
                    y,
                    width: geo.schema_width,
                    height: geo.schema_height,
                },
            );
        }
        if let Some(children) = graph.get_children(id) {
            for child_id in children {
                self.extract_schema_only_recursive(child_id, graph);
            }
        }
    }

    /// Get the full layout result
    pub fn result(&self) -> &LayoutResult {
        &self.result
    }

    /// Extract schema width, height from any node type
    fn get_schema_size(node: &Node) -> (f32, f32) {
        match node {
            Node::Container(n) => (
                n.layout_dimensions.layout_target_width.unwrap_or(0.0),
                n.layout_dimensions.layout_target_height.unwrap_or(0.0),
            ),
            Node::Rectangle(n) => (n.size.width, n.size.height),
            Node::Ellipse(n) => (n.size.width, n.size.height),
            Node::Image(n) => (n.size.width, n.size.height),
            Node::Line(n) => (n.size.width, n.size.height),
            Node::Polygon(n) => {
                let rect = n.rect();
                (rect.width, rect.height)
            }
            Node::RegularPolygon(n) => (n.size.width, n.size.height),
            Node::RegularStarPolygon(n) => (n.size.width, n.size.height),
            Node::TextSpan(n) => (n.width.unwrap_or(0.0), n.height.unwrap_or(0.0)),
            Node::AttributedText(n) => (n.width.unwrap_or(0.0), n.height.unwrap_or(0.0)),
            Node::Vector(n) => {
                let rect = n.network.bounds();
                (rect.width, rect.height)
            }
            Node::Path(n) => {
                // Use NodeRectMixin::rect() to compute bounds from path data
                // Note: This involves SVG parsing and is not cached - avoid in tight loops
                let rect = n.rect();
                (rect.width, rect.height)
            }
            Node::Group(_) | Node::BooleanOperation(_) => {
                // Size derived from children bounds (dynamic)
                (0.0, 0.0)
            }
            Node::Error(n) => (n.size.width, n.size.height),
            Node::InitialContainer(_) => (0.0, 0.0), // Size set by viewport
        }
    }

    /// Extract schema x, y position from any node type
    ///
    /// Used for infinite canvas support: root nodes use their schema positions
    /// instead of Taffy's computed (0, 0) position.
    ///
    /// - Container nodes use `position.x()` / `position.y()`
    /// - Leaf nodes (Rectangle, Ellipse, etc.) use `transform.x()` / `transform.y()`
    /// - ICB (InitialContainerBlock) always returns (0, 0)
    fn get_schema_position(node: &Node) -> (f32, f32) {
        match node {
            // Container nodes use position field
            Node::InitialContainer(_) => (0.0, 0.0), // ICB always at origin
            Node::Container(n) => (n.position.x().unwrap_or(0.0), n.position.y().unwrap_or(0.0)),

            // Leaf nodes with transform field
            Node::Rectangle(n) => (n.transform.x(), n.transform.y()),
            Node::Ellipse(n) => (n.transform.x(), n.transform.y()),
            Node::Image(n) => (n.transform.x(), n.transform.y()),
            Node::Line(n) => (n.transform.x(), n.transform.y()),
            Node::Polygon(n) => (n.transform.x(), n.transform.y()),
            Node::RegularPolygon(n) => (n.transform.x(), n.transform.y()),
            Node::RegularStarPolygon(n) => (n.transform.x(), n.transform.y()),
            Node::TextSpan(n) => (n.transform.x(), n.transform.y()),
            Node::AttributedText(n) => (n.transform.x(), n.transform.y()),
            Node::Vector(n) => (n.transform.x(), n.transform.y()),
            Node::Path(n) => (n.transform.x(), n.transform.y()),
            Node::Error(n) => (n.transform.x(), n.transform.y()),

            // Complex nodes with optional transform
            Node::Group(n) => {
                let t = n.transform.unwrap_or_default();
                (t.x(), t.y())
            }
            Node::BooleanOperation(n) => {
                let t = n.transform.unwrap_or_default();
                (t.x(), t.y())
            }
        }
    }

    /// Check if a node type participates in Taffy layout (using NodeTypeTag).
    ///
    /// Virtual grouping nodes (Group, BooleanOperation) are excluded — they
    /// have no intrinsic size, don't constrain children, and their bounds are
    /// derived from children. Their children form independent Taffy subtrees.
    fn is_layout_node_tag(tag: NodeTypeTag) -> bool {
        !matches!(tag, NodeTypeTag::Group | NodeTypeTag::BooleanOperation)
    }

    /// Recursively build Taffy tree for a node and its descendants.
    ///
    /// Virtual grouping nodes (Group, BooleanOperation) are skipped from the
    /// Taffy tree, but their children are still visited. Taffy-capable children
    /// found under non-layout parents are collected in `extra_roots` so the
    /// caller can compute layout for them as independent subtrees.
    fn build_taffy_subtree(
        &mut self,
        node_id: &NodeId,
        graph: &SceneGraph,
        viewport_size: Size,
        extra_roots: &mut Vec<taffy::NodeId>,
    ) -> Option<taffy::NodeId> {
        // Fast-path: use compact layer_core (~16 bytes) for is_layout_node
        // and is_flex_container checks before touching the full Node (~500+ bytes).
        let lc = graph.get_layer_core(node_id)?;

        // Virtual grouping nodes don't participate in Taffy — skip them but
        // recurse into their children to discover Taffy-capable subtrees.
        if !Self::is_layout_node_tag(lc.node_type) {
            if let Some(children) = graph.get_children(node_id) {
                for child_id in children {
                    if let Some(taffy_id) =
                        self.build_taffy_subtree(child_id, graph, viewport_size, extra_roots)
                    {
                        extra_roots.push(taffy_id);
                    }
                }
            }
            return None;
        }

        // Only access full Node for nodes that participate in Taffy layout.
        let node = graph.get_node(node_id).ok()?;

        // Get style for this node (universal mapping)
        let mut style = crate::layout::into_taffy::node_to_taffy_style(node, graph, node_id);

        // Note: Root nodes are laid out by Taffy at (0,0)
        // extract_all_layouts() post-processes to apply schema positions

        // Special handling for root ICB nodes - use viewport size
        if lc.node_type == NodeTypeTag::InitialContainer {
            style.size = taffy::Size {
                width: Dimension::length(viewport_size.width),
                height: Dimension::length(viewport_size.height),
            };
        }

        // Check if node has children
        let children = graph.get_children(node_id);

        if let Some(children) = children {
            if !children.is_empty() {
                // For non-flex containers (LayoutMode::Normal), children are
                // positioned via schema coordinates, not flex layout. Create
                // this container as a Taffy leaf — it only needs its own size
                // for its parent's flex computation. Children will be handled
                // by extract_all_layouts using schema positions directly.
                //
                // This is the critical optimization for Figma imports: most
                // containers use Normal mode, so we skip building Taffy nodes
                // for their entire subtrees (~90%+ of nodes).
                if !lc.is_flex {
                    return self.tree.new_leaf(*node_id, style).ok();
                }

                // Flex containers: build children as Taffy children
                let taffy_children: Vec<taffy::NodeId> = children
                    .iter()
                    .filter_map(|child_id| {
                        self.build_taffy_subtree(child_id, graph, viewport_size, extra_roots)
                    })
                    .collect();

                // Create parent with children
                return self
                    .tree
                    .new_with_children(*node_id, style, &taffy_children)
                    .ok();
            }
        }

        // Leaf node
        match node {
            Node::TextSpan(n) => {
                let ctx = TextMeasureContext {
                    scene_node_id: *node_id,
                    text: n.text.clone(),
                    text_style: n.text_style.clone(),
                    text_align: n.text_align.clone(),
                    max_lines: n.max_lines.clone(),
                    ellipsis: n.ellipsis.clone(),
                    width: n.width,
                    height: n.height,
                };
                self.tree.new_text_leaf(*node_id, style, ctx).ok()
            }
            Node::AttributedText(n) => {
                let ctx = AttributedTextMeasureContext {
                    scene_node_id: *node_id,
                    attributed_string: n.attributed_string.clone(),
                    text_align: n.text_align.clone(),
                    max_lines: n.max_lines.clone(),
                    ellipsis: n.ellipsis.clone(),
                    width: n.width,
                    height: n.height,
                };
                self.tree
                    .new_attributed_text_leaf(*node_id, style, ctx)
                    .ok()
            }
            _ => self.tree.new_leaf(*node_id, style).ok(),
        }
    }

    /// Recursively extract all computed layouts from the Taffy tree.
    ///
    /// **Infinite Canvas Support**: Taffy computes all tree roots at (0, 0).
    /// We override root positions with their schema positions so multiple
    /// artboards/nodes can be positioned anywhere in the viewport.
    ///
    /// **Non-layout nodes** (Group, BooleanOperation) are not in the Taffy
    /// tree — they get manual layout results from their schema.
    /// **Non-flex containers** (LayoutMode::Normal) ARE in Taffy (as leaves
    /// for their parent's flex computation) but their children are independent
    /// subtrees with schema positions.
    /// In both cases, children become independent Taffy subtree roots
    /// (computed at 0,0), so we detect this via parent-type check and apply
    /// schema positions. No extra bookkeeping is needed.
    fn extract_all_layouts(
        &mut self,
        id: &NodeId,
        graph: &SceneGraph,
        text_measure: &mut Option<TextMeasureProvider<'_>>,
    ) {
        if let Some(layout) = self.tree.get_layout(id) {
            let mut computed = ComputedLayout::from(layout);

            // Taffy roots are computed at (0,0). Three cases need schema-position
            // correction:
            // 1. Graph roots — top-level nodes on the infinite canvas
            // 2. Children of non-layout parents (Group/BoolOp) — independent
            //    Taffy subtree roots, also computed at (0,0)
            // 3. Children of non-flex containers (LayoutMode::Normal) — these
            //    are also extra_roots with schema positions
            //
            // Uses layer_core (~16 bytes) instead of full Node (~500+ bytes)
            // for parent type checks.
            let needs_schema_position = graph.is_root(id)
                || graph
                    .get_parent(id)
                    .and_then(|pid| graph.get_layer_core(&pid))
                    .is_some_and(|parent_lc| {
                        !Self::is_layout_node_tag(parent_lc.node_type) || !parent_lc.is_flex
                    });

            if needs_schema_position {
                // Use geo_data (~48 bytes) for schema position instead of full Node.
                if let Some(geo) = graph.geo_data().get(id) {
                    computed.x = geo.schema_transform.x();
                    computed.y = geo.schema_transform.y();
                }
            }

            self.result.insert(*id, computed);
        } else {
            // Node not in Taffy tree — use schema positions/sizes from geo_data.
            // For text nodes with missing dimensions, access full Node for measurement.
            let lc = graph.get_layer_core(id);
            let is_text = lc
                .map(|c| {
                    c.node_type == NodeTypeTag::TextSpan
                        || c.node_type == NodeTypeTag::AttributedText
                })
                .unwrap_or(false);

            if is_text {
                // Text node: may need on-the-fly measurement — access full Node.
                if let Ok(node) = graph.get_node(id) {
                    let (x, y) = Self::get_schema_position(node);
                    let (mut width, mut height) = Self::get_schema_size(node);

                    if let Node::TextSpan(n) = node {
                        if n.width.is_none() || n.height.is_none() {
                            if let Some(ref mut provider) = text_measure {
                                let measurements = provider.paragraph_cache.measure(
                                    &n.text,
                                    &n.text_style,
                                    &n.text_align,
                                    &n.max_lines,
                                    &n.ellipsis,
                                    n.width,
                                    provider.fonts,
                                    Some(id),
                                );
                                if n.width.is_none() {
                                    width = measurements.max_width;
                                }
                                if n.height.is_none() {
                                    height = measurements.height;
                                }
                            }
                        }
                    } else if let Node::AttributedText(n) = node {
                        if n.width.is_none() || n.height.is_none() {
                            if let Some(ref mut provider) = text_measure {
                                let measurements = provider.paragraph_cache.measure_attributed(
                                    &n.attributed_string,
                                    &n.text_align,
                                    &n.max_lines,
                                    &n.ellipsis,
                                    n.width,
                                    provider.fonts,
                                    Some(id),
                                );
                                if n.width.is_none() {
                                    width = measurements.max_width;
                                }
                                if n.height.is_none() {
                                    height = measurements.height;
                                }
                            }
                        }
                    }

                    self.result.insert(
                        *id,
                        ComputedLayout {
                            x,
                            y,
                            width,
                            height,
                        },
                    );
                }
            } else if let Some(geo) = graph.geo_data().get(id) {
                // Non-text: use geo_data (~48 bytes) instead of full Node (~500+ bytes).
                self.result.insert(
                    *id,
                    ComputedLayout {
                        x: geo.schema_transform.x(),
                        y: geo.schema_transform.y(),
                        width: geo.schema_width,
                        height: geo.schema_height,
                    },
                );
            }
        }

        // Recurse for children
        if let Some(children) = graph.get_children(id) {
            for child_id in children {
                self.extract_all_layouts(child_id, graph, text_measure);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cg::prelude::*;
    use crate::node::factory::NodeFactory;
    use crate::node::scene_graph::{Parent, SceneGraph};
    use crate::node::schema::*;
    use math2::transform::AffineTransform;

    /// Test 1: Flex container with mixed node types
    #[test]
    fn test_universal_layout_mixed_nodes() {
        let mut engine = LayoutEngine::new();
        let nf = NodeFactory::new();
        let mut graph = SceneGraph::new();

        // Create a flex container
        let mut container = nf.create_container_node();
        container.layout_container = LayoutContainerStyle {
            layout_mode: LayoutMode::Flex,
            layout_direction: Axis::Horizontal,
            layout_gap: Some(LayoutGap::uniform(10.0)),
            ..Default::default()
        };
        container.layout_dimensions.layout_target_width = Some(300.0);
        container.layout_dimensions.layout_target_height = Some(200.0);

        let container_id = graph.append_child(Node::Container(container), Parent::Root);

        // Add a rectangle child
        let mut rect = nf.create_rectangle_node();
        rect.size = Size {
            width: 50.0,
            height: 50.0,
        };
        let rect_id = graph.append_child(Node::Rectangle(rect), Parent::NodeId(container_id));

        // Add an ellipse child
        let mut ellipse = nf.create_ellipse_node();
        ellipse.size = Size {
            width: 60.0,
            height: 60.0,
        };
        let ellipse_id = graph.append_child(Node::Ellipse(ellipse), Parent::NodeId(container_id));

        let scene = Scene {
            name: "Mixed nodes test".to_string(),
            graph,
            background_color: None,
        };

        let result = engine.compute(
            &scene,
            Size {
                width: 800.0,
                height: 600.0,
            },
            None,
        );

        // Verify all nodes get layout results
        assert!(result.get(&container_id).is_some());
        assert!(result.get(&rect_id).is_some());
        assert!(result.get(&ellipse_id).is_some());

        // Verify layout positions (rect should be at 0,0, ellipse at 60,0 due to gap)
        let rect_layout = result.get(&rect_id).unwrap();
        let ellipse_layout = result.get(&ellipse_id).unwrap();

        assert_eq!(rect_layout.x, 0.0);
        assert_eq!(rect_layout.y, 0.0);
        assert_eq!(ellipse_layout.x, 60.0); // 50 + 10 gap
        assert_eq!(ellipse_layout.y, 0.0);
    }

    /// Test 2: Root container without ICB
    #[test]
    fn test_root_container_no_icb() {
        let mut engine = LayoutEngine::new();
        let nf = NodeFactory::new();
        let mut graph = SceneGraph::new();

        // Create a container as root (no ICB)
        let mut container = nf.create_container_node();
        container.layout_container = LayoutContainerStyle {
            layout_mode: LayoutMode::Flex,
            layout_direction: Axis::Vertical,
            ..Default::default()
        };
        container.layout_dimensions.layout_target_width = Some(200.0);
        container.layout_dimensions.layout_target_height = Some(150.0);

        let container_id = graph.append_child(Node::Container(container), Parent::Root);

        // Add a child rectangle
        let mut rect = nf.create_rectangle_node();
        rect.size = Size {
            width: 100.0,
            height: 50.0,
        };
        let rect_id = graph.append_child(Node::Rectangle(rect), Parent::NodeId(container_id));

        let scene = Scene {
            name: "Root container test".to_string(),
            graph,
            background_color: None,
        };

        let result = engine.compute(
            &scene,
            Size {
                width: 800.0,
                height: 600.0,
            },
            None,
        );

        // Verify layout works without ICB
        assert!(result.get(&container_id).is_some());
        assert!(result.get(&rect_id).is_some());

        let container_layout = result.get(&container_id).unwrap();
        let rect_layout = result.get(&rect_id).unwrap();

        // Container should be positioned at its specified size
        assert_eq!(container_layout.width, 200.0);
        assert_eq!(container_layout.height, 150.0);

        // Rectangle should be positioned within the container
        assert_eq!(rect_layout.width, 100.0);
        assert_eq!(rect_layout.height, 50.0);
    }

    /// Test 3: Root rectangle (non-layout node)
    #[test]
    fn test_root_static_node() {
        let mut engine = LayoutEngine::new();
        let nf = NodeFactory::new();
        let mut graph = SceneGraph::new();

        // Create a rectangle as root
        let mut rect = nf.create_rectangle_node();
        rect.size = Size {
            width: 100.0,
            height: 80.0,
        };
        let rect_id = graph.append_child(Node::Rectangle(rect), Parent::Root);

        let scene = Scene {
            name: "Root rectangle test".to_string(),
            graph,
            background_color: None,
        };

        let result = engine.compute(
            &scene,
            Size {
                width: 800.0,
                height: 600.0,
            },
            None,
        );

        // Verify rectangle gets layout result with its dimensions
        assert!(result.get(&rect_id).is_some());

        let rect_layout = result.get(&rect_id).unwrap();
        assert_eq!(rect_layout.width, 100.0);
        assert_eq!(rect_layout.height, 80.0);
        assert_eq!(rect_layout.x, 0.0);
        assert_eq!(rect_layout.y, 0.0);
    }

    /// Test 4: Nested flex containers
    #[test]
    fn test_nested_flex_containers() {
        let mut engine = LayoutEngine::new();
        let nf = NodeFactory::new();
        let mut graph = SceneGraph::new();

        // Outer container (horizontal)
        let mut outer = nf.create_container_node();
        outer.layout_container = LayoutContainerStyle {
            layout_mode: LayoutMode::Flex,
            layout_direction: Axis::Horizontal,
            ..Default::default()
        };
        outer.layout_dimensions.layout_target_width = Some(400.0);
        outer.layout_dimensions.layout_target_height = Some(200.0);
        let outer_id = graph.append_child(Node::Container(outer), Parent::Root);

        // Inner container (vertical)
        let mut inner = nf.create_container_node();
        inner.layout_container = LayoutContainerStyle {
            layout_mode: LayoutMode::Flex,
            layout_direction: Axis::Vertical,
            ..Default::default()
        };
        inner.layout_dimensions.layout_target_width = Some(200.0);
        inner.layout_dimensions.layout_target_height = Some(150.0);
        let inner_id = graph.append_child(Node::Container(inner), Parent::NodeId(outer_id));

        // Rectangle in inner container
        let mut rect = nf.create_rectangle_node();
        rect.size = Size {
            width: 50.0,
            height: 30.0,
        };
        let rect_id = graph.append_child(Node::Rectangle(rect), Parent::NodeId(inner_id));

        let scene = Scene {
            name: "Nested containers test".to_string(),
            graph,
            background_color: None,
        };

        let result = engine.compute(
            &scene,
            Size {
                width: 800.0,
                height: 600.0,
            },
            None,
        );

        // Verify nested layout computation
        assert!(result.get(&outer_id).is_some());
        assert!(result.get(&inner_id).is_some());
        assert!(result.get(&rect_id).is_some());

        let rect_layout = result.get(&rect_id).unwrap();
        assert_eq!(rect_layout.width, 50.0);
        assert_eq!(rect_layout.height, 30.0);
    }

    /// Test 5: ICB with direct children (existing behavior)
    #[test]
    fn test_icb_flex_layout() {
        let mut engine = LayoutEngine::new();
        let nf = NodeFactory::new();
        let mut graph = SceneGraph::new();

        // Create ICB
        let mut icb = nf.create_initial_container_node();
        icb.layout_mode = LayoutMode::Flex;
        icb.layout_direction = Axis::Horizontal;
        icb.layout_gap = LayoutGap {
            main_axis_gap: 20.0,
            cross_axis_gap: 20.0,
        };
        let icb_id = graph.append_child(Node::InitialContainer(icb), Parent::Root);

        // Add container children
        let mut container1 = nf.create_container_node();
        container1.layout_dimensions.layout_target_width = Some(100.0);
        container1.layout_dimensions.layout_target_height = Some(100.0);
        let container1_id = graph.append_child(Node::Container(container1), Parent::NodeId(icb_id));

        let mut container2 = nf.create_container_node();
        container2.layout_dimensions.layout_target_width = Some(100.0);
        container2.layout_dimensions.layout_target_height = Some(100.0);
        let container2_id = graph.append_child(Node::Container(container2), Parent::NodeId(icb_id));

        let scene = Scene {
            name: "ICB flex test".to_string(),
            graph,
            background_color: None,
        };

        let result = engine.compute(
            &scene,
            Size {
                width: 800.0,
                height: 600.0,
            },
            None,
        );

        // Verify ICB fills viewport and lays out children
        assert!(result.get(&icb_id).is_some());
        assert!(result.get(&container1_id).is_some());
        assert!(result.get(&container2_id).is_some());

        let icb_layout = result.get(&icb_id).unwrap();
        let container1_layout = result.get(&container1_id).unwrap();
        let container2_layout = result.get(&container2_id).unwrap();

        // ICB should fill viewport
        assert_eq!(icb_layout.width, 800.0);
        assert_eq!(icb_layout.height, 600.0);

        // Children should be positioned horizontally with gap
        assert_eq!(container1_layout.x, 0.0);
        assert_eq!(container2_layout.x, 120.0); // 100 + 20 gap
    }

    /// Test 6: Text nodes in flex layout
    #[test]
    fn test_text_in_flex() {
        let mut engine = LayoutEngine::new();
        let nf = NodeFactory::new();
        let mut graph = SceneGraph::new();

        // Create flex container
        let mut container = nf.create_container_node();
        container.layout_container = LayoutContainerStyle {
            layout_mode: LayoutMode::Flex,
            layout_direction: Axis::Horizontal,
            ..Default::default()
        };
        container.layout_dimensions.layout_target_width = Some(300.0);
        container.layout_dimensions.layout_target_height = Some(100.0);
        let container_id = graph.append_child(Node::Container(container), Parent::Root);

        // Add text child
        let mut text = nf.create_text_span_node();
        text.width = Some(150.0);
        let text_id = graph.append_child(Node::TextSpan(text), Parent::NodeId(container_id));

        let scene = Scene {
            name: "Text in flex test".to_string(),
            graph,
            background_color: None,
        };

        let result = engine.compute(
            &scene,
            Size {
                width: 800.0,
                height: 600.0,
            },
            None,
        );

        // Verify text participates in layout
        assert!(result.get(&container_id).is_some());
        assert!(result.get(&text_id).is_some());

        let text_layout = result.get(&text_id).unwrap();
        assert_eq!(text_layout.width, 150.0);
    }

    /// Test 7: Multiple root nodes
    #[test]
    fn test_multiple_roots() {
        let mut engine = LayoutEngine::new();
        let nf = NodeFactory::new();
        let mut graph = SceneGraph::new();

        // First root container
        let mut container1 = nf.create_container_node();
        container1.layout_dimensions.layout_target_width = Some(200.0);
        container1.layout_dimensions.layout_target_height = Some(100.0);
        let container1_id = graph.append_child(Node::Container(container1), Parent::Root);

        // Second root container
        let mut container2 = nf.create_container_node();
        container2.layout_dimensions.layout_target_width = Some(150.0);
        container2.layout_dimensions.layout_target_height = Some(80.0);
        let container2_id = graph.append_child(Node::Container(container2), Parent::Root);

        let scene = Scene {
            name: "Multiple roots test".to_string(),
            graph,
            background_color: None,
        };

        let result = engine.compute(
            &scene,
            Size {
                width: 800.0,
                height: 600.0,
            },
            None,
        );

        // Verify each root is laid out independently
        assert!(result.get(&container1_id).is_some());
        assert!(result.get(&container2_id).is_some());

        let container1_layout = result.get(&container1_id).unwrap();
        let container2_layout = result.get(&container2_id).unwrap();

        assert_eq!(container1_layout.width, 200.0);
        assert_eq!(container1_layout.height, 100.0);
        assert_eq!(container2_layout.width, 150.0);
        assert_eq!(container2_layout.height, 80.0);
    }

    /// Test 8: Empty container
    #[test]
    fn test_empty_container() {
        let mut engine = LayoutEngine::new();
        let nf = NodeFactory::new();
        let mut graph = SceneGraph::new();

        // Create container with no children
        let mut container = nf.create_container_node();
        container.layout_dimensions.layout_target_width = Some(200.0);
        container.layout_dimensions.layout_target_height = Some(100.0);
        let container_id = graph.append_child(Node::Container(container), Parent::Root);

        let scene = Scene {
            name: "Empty container test".to_string(),
            graph,
            background_color: None,
        };

        let result = engine.compute(
            &scene,
            Size {
                width: 800.0,
                height: 600.0,
            },
            None,
        );

        // Verify it still gets layout result
        assert!(result.get(&container_id).is_some());

        let container_layout = result.get(&container_id).unwrap();
        assert_eq!(container_layout.width, 200.0);
        assert_eq!(container_layout.height, 100.0);
    }

    #[test]
    fn test_grida_style_has_zero_flex_shrink() {
        // Verify that Grida's default style has flex_shrink: 0.0
        use crate::layout::into_taffy::node_to_taffy_style;

        let nf = NodeFactory::new();
        let mut rect = nf.create_rectangle_node();
        rect.size = Size {
            width: 100.0,
            height: 100.0,
        };

        let node = Node::Rectangle(rect);
        let graph = SceneGraph::new();
        let node_id: NodeId = 0;
        let style = node_to_taffy_style(&node, &graph, &node_id);

        // Verify flex_shrink is 0.0, not Taffy's default 1.0
        assert_eq!(
            style.flex_shrink, 0.0,
            "Grida nodes should have flex_shrink: 0.0 by default"
        );
    }

    #[test]
    fn test_container_children_dont_shrink_by_default() {
        // Verify that children in a flex container don't shrink when overflowing
        let nf = NodeFactory::new();
        let mut graph = SceneGraph::new();

        // Create a 200px wide flex container (horizontal)
        let mut container = nf.create_container_node();
        container.layout_container = LayoutContainerStyle {
            layout_mode: LayoutMode::Flex,
            layout_direction: Axis::Horizontal,
            ..Default::default()
        };
        container.layout_dimensions.layout_target_width = Some(200.0);
        container.layout_dimensions.layout_target_height = Some(100.0);
        let container_id = graph.append_child(Node::Container(container), Parent::Root);

        // Add three 100px wide children (total: 300px > 200px container)
        for _ in 0..3 {
            let mut rect = nf.create_rectangle_node();
            rect.size = Size {
                width: 100.0,
                height: 50.0,
            };
            graph.append_child(Node::Rectangle(rect), Parent::NodeId(container_id));
        }

        // Compute layout
        let scene = Scene {
            name: "test".to_string(),
            graph,
            background_color: None,
        };
        let mut engine = LayoutEngine::new();
        let result = engine.compute(
            &scene,
            Size {
                width: 800.0,
                height: 600.0,
            },
            None,
        );

        // With flex_shrink: 0.0, children should NOT shrink
        // They keep their 100px width (overflow behavior)
        let children = scene.graph.get_children(&container_id).unwrap();
        for child_id in children {
            if let Some(layout) = result.get(child_id) {
                assert_eq!(
                    layout.width, 100.0,
                    "Children should NOT shrink from 100px (flex_shrink: 0.0)"
                );
            }
        }
    }

    #[test]
    fn test_flex_wrap_gap_spacing() {
        // Verify that gap spacing is correct when items wrap
        // This tests that cross_axis_gap maps to row-gap correctly
        let nf = NodeFactory::new();
        let mut graph = SceneGraph::new();

        // Create a small width container (150px) with horizontal flex and wrap
        // This will force two 100px items to wrap onto separate rows
        let mut container = nf.create_container_node();
        container.layout_container = LayoutContainerStyle {
            layout_mode: LayoutMode::Flex,
            layout_direction: Axis::Horizontal,
            layout_wrap: Some(LayoutWrap::Wrap),
            layout_gap: Some(LayoutGap {
                main_axis_gap: 5.0,   // horizontal gap (column-gap)
                cross_axis_gap: 20.0, // vertical gap (row-gap) - this should be exact!
            }),
            ..Default::default()
        };
        container.layout_dimensions.layout_target_width = Some(150.0);
        container.layout_dimensions.layout_target_height = Some(300.0); // Tall enough to see vertical gap
        let container_id = graph.append_child(Node::Container(container), Parent::Root);

        // Add two 100px wide items (will wrap because 200px > 150px container)
        let mut rect1 = nf.create_rectangle_node();
        rect1.size = Size {
            width: 100.0,
            height: 50.0,
        };
        let child1_id = graph.append_child(Node::Rectangle(rect1), Parent::NodeId(container_id));

        let mut rect2 = nf.create_rectangle_node();
        rect2.size = Size {
            width: 100.0,
            height: 50.0,
        };
        let child2_id = graph.append_child(Node::Rectangle(rect2), Parent::NodeId(container_id));

        // Compute layout
        let scene = Scene {
            name: "test".to_string(),
            graph,
            background_color: None,
        };
        let mut engine = LayoutEngine::new();
        let result = engine.compute(
            &scene,
            Size {
                width: 800.0,
                height: 600.0,
            },
            None,
        );

        // Get layouts
        let layout1 = result.get(&child1_id).expect("Child 1 should have layout");
        let layout2 = result.get(&child2_id).expect("Child 2 should have layout");

        // Child 1 should be at y=0
        assert_eq!(layout1.y, 0.0, "First item should be at y=0");

        // Child 2 should wrap to next row
        // y position = first item height (50) + cross_axis_gap (20) = 70
        assert_eq!(
            layout2.y, 70.0,
            "Second item should be at y = 50 (first item height) + 20 (cross_axis_gap)"
        );

        // Both items should be at x=0 (start of their respective rows)
        assert_eq!(layout1.x, 0.0);
        assert_eq!(layout2.x, 0.0);
    }

    #[test]
    fn test_flex_wrap_with_center_alignment() {
        // Verify that wrap + center alignment works correctly
        // Even with a single child that doesn't actually wrap
        let nf = NodeFactory::new();
        let mut graph = SceneGraph::new();

        // Create a 1000x1000 container with center alignment and wrap
        let mut container = nf.create_container_node();
        container.layout_container = LayoutContainerStyle {
            layout_mode: LayoutMode::Flex,
            layout_direction: Axis::Horizontal,
            layout_wrap: Some(LayoutWrap::Wrap),
            layout_main_axis_alignment: Some(MainAxisAlignment::Center),
            layout_cross_axis_alignment: Some(CrossAxisAlignment::Center),
            ..Default::default()
        };
        container.layout_dimensions.layout_target_width = Some(1000.0);
        container.layout_dimensions.layout_target_height = Some(1000.0);
        let container_id = graph.append_child(Node::Container(container), Parent::Root);

        // Add a single 100x100 child
        let mut rect = nf.create_rectangle_node();
        rect.size = Size {
            width: 100.0,
            height: 100.0,
        };
        let child_id = graph.append_child(Node::Rectangle(rect), Parent::NodeId(container_id));

        // Compute layout
        let scene = Scene {
            name: "test".to_string(),
            graph,
            background_color: None,
        };
        let mut engine = LayoutEngine::new();
        let result = engine.compute(
            &scene,
            Size {
                width: 1200.0,
                height: 1200.0,
            },
            None,
        );

        // Get layout
        let layout = result.get(&child_id).expect("Child should have layout");

        // Child should be centered in both axes
        // Main axis (horizontal): x = (1000 - 100) / 2 = 450
        // Cross axis (vertical): y = (1000 - 100) / 2 = 450
        assert_eq!(
            layout.x, 450.0,
            "Child should be centered horizontally (main axis)"
        );
        assert_eq!(
            layout.y, 450.0,
            "Child should be centered vertically (cross axis)"
        );
    }

    #[test]
    fn test_absolute_positioned_child_not_in_flex_flow() {
        // Verify that absolutely positioned children don't affect flex layout flow
        // but still get positioned by Taffy

        let nf = NodeFactory::new();
        let mut graph = SceneGraph::new();

        // Create a flex container
        let mut container = nf.create_container_node();
        container.layout_container = LayoutContainerStyle {
            layout_mode: LayoutMode::Flex,
            layout_direction: Axis::Horizontal,
            layout_gap: Some(LayoutGap::uniform(10.0)),
            ..Default::default()
        };
        container.layout_dimensions.layout_target_width = Some(400.0);
        container.layout_dimensions.layout_target_height = Some(200.0);
        let container_id = graph.append_child(Node::Container(container), Parent::Root);

        // Add a normal (relative) child
        let mut rect1 = nf.create_rectangle_node();
        rect1.size = Size {
            width: 100.0,
            height: 100.0,
        };
        let child1_id = graph.append_child(Node::Rectangle(rect1), Parent::NodeId(container_id));

        // Add an absolutely positioned child at (50, 75)
        let mut rect2 = nf.create_rectangle_node();
        rect2.size = Size {
            width: 100.0,
            height: 100.0,
        };
        rect2.transform = AffineTransform::new(50.0, 75.0, 0.0);
        rect2.layout_child = Some(LayoutChildStyle {
            layout_positioning: LayoutPositioning::Absolute,
            layout_grow: 0.0,
        });
        let child2_id = graph.append_child(Node::Rectangle(rect2), Parent::NodeId(container_id));

        // Add another normal child
        let mut rect3 = nf.create_rectangle_node();
        rect3.size = Size {
            width: 100.0,
            height: 100.0,
        };
        let child3_id = graph.append_child(Node::Rectangle(rect3), Parent::NodeId(container_id));

        // Compute layout
        let scene = Scene {
            name: "test".to_string(),
            graph,
            background_color: None,
        };
        let mut engine = LayoutEngine::new();
        let result = engine.compute(
            &scene,
            Size {
                width: 800.0,
                height: 600.0,
            },
            None,
        );

        // Verify all children get layout results (Taffy computes absolute positioned ones too)
        let layout1 = result
            .get(&child1_id)
            .expect("Relative child 1 should have layout");
        let layout2 = result
            .get(&child2_id)
            .expect("Absolute child 2 should have layout from Taffy");
        let layout3 = result
            .get(&child3_id)
            .expect("Relative child 3 should have layout");

        // Verify that relative children are positioned as if absolute child doesn't exist in flex flow
        // child1 at x=0, child3 at x=110 (100 + 10 gap)
        assert_eq!(layout1.x, 0.0, "First relative child at x=0");
        assert_eq!(
            layout3.x, 110.0,
            "Second relative child at x=110 (ignoring absolute child in flex flow)"
        );

        // Verify absolute child is positioned at its inset coordinates (50, 75)
        assert_eq!(layout2.x, 50.0, "Absolute child at x=50 (from inset)");
        assert_eq!(layout2.y, 75.0, "Absolute child at y=75 (from inset)");
    }

    #[test]
    fn test_root_container_respects_position() {
        // Verify that root containers at non-zero positions work correctly
        // LayoutEngine post-processes Taffy results to apply schema positions
        let nf = NodeFactory::new();
        let mut graph = SceneGraph::new();

        // Create a root container at position (100, 50)
        let mut container = nf.create_container_node();
        container.position = LayoutPositioningBasis::Cartesian(CGPoint::new(100.0, 50.0));
        container.layout_dimensions.layout_target_width = Some(200.0);
        container.layout_dimensions.layout_target_height = Some(150.0);
        let container_id = graph.append_child(Node::Container(container), Parent::Root);

        let scene = Scene {
            name: "test".to_string(),
            graph,
            background_color: None,
        };

        let mut engine = LayoutEngine::new();
        let result = engine.compute(
            &scene,
            Size {
                width: 800.0,
                height: 600.0,
            },
            None,
        );

        let layout = result
            .get(&container_id)
            .expect("Root container should have layout");

        // LayoutEngine corrects root positions after Taffy computation
        assert_eq!(layout.x, 100.0, "Root container x from schema");
        assert_eq!(layout.y, 50.0, "Root container y from schema");
        assert_eq!(layout.width, 200.0);
        assert_eq!(layout.height, 150.0);
    }

    #[test]
    fn test_root_node_always_gets_layout_even_if_marked_absolute() {
        // Verify that root nodes always participate in layout,
        // even if they somehow have layout_child with Absolute positioning

        let nf = NodeFactory::new();
        let mut graph = SceneGraph::new();

        // Create a root rectangle marked as "absolute" (shouldn't matter for roots)
        let mut rect = nf.create_rectangle_node();
        rect.size = Size {
            width: 200.0,
            height: 150.0,
        };
        rect.transform = AffineTransform::new(100.0, 50.0, 0.0);
        rect.layout_child = Some(LayoutChildStyle {
            layout_positioning: LayoutPositioning::Absolute,
            layout_grow: 0.0,
        });
        let rect_id = graph.append_child(Node::Rectangle(rect), Parent::Root);

        // Compute layout
        let scene = Scene {
            name: "test".to_string(),
            graph,
            background_color: None,
        };
        let mut engine = LayoutEngine::new();
        let result = engine.compute(
            &scene,
            Size {
                width: 800.0,
                height: 600.0,
            },
            None,
        );

        // Root node MUST get layout result, even if marked absolute
        let layout = result
            .get(&rect_id)
            .expect("Root node must ALWAYS have layout result, even if marked absolute");

        // Verify it has its dimensions
        assert_eq!(layout.width, 200.0);
        assert_eq!(layout.height, 150.0);
    }

    #[test]
    fn test_mixed_absolute_and_relative_children() {
        // Complex scenario: flex container with mix of absolute and relative children

        let nf = NodeFactory::new();
        let mut graph = SceneGraph::new();

        // Create flex container
        let mut container = nf.create_container_node();
        container.layout_container = LayoutContainerStyle {
            layout_mode: LayoutMode::Flex,
            layout_direction: Axis::Vertical,
            layout_gap: Some(LayoutGap::uniform(20.0)),
            ..Default::default()
        };
        container.layout_dimensions.layout_target_width = Some(300.0);
        container.layout_dimensions.layout_target_height = Some(500.0);
        let container_id = graph.append_child(Node::Container(container), Parent::Root);

        // Relative child 1
        let mut rect1 = nf.create_rectangle_node();
        rect1.size = Size {
            width: 100.0,
            height: 50.0,
        };
        let child1_id = graph.append_child(Node::Rectangle(rect1), Parent::NodeId(container_id));

        // Absolute child (should be excluded)
        let mut rect2 = nf.create_rectangle_node();
        rect2.size = Size {
            width: 80.0,
            height: 80.0,
        };
        rect2.layout_child = Some(LayoutChildStyle {
            layout_positioning: LayoutPositioning::Absolute,
            layout_grow: 0.0,
        });
        let child2_id = graph.append_child(Node::Rectangle(rect2), Parent::NodeId(container_id));

        // Relative child 2
        let mut rect3 = nf.create_rectangle_node();
        rect3.size = Size {
            width: 100.0,
            height: 50.0,
        };
        let child3_id = graph.append_child(Node::Rectangle(rect3), Parent::NodeId(container_id));

        // Absolute child (should be excluded)
        let mut rect4 = nf.create_rectangle_node();
        rect4.size = Size {
            width: 60.0,
            height: 60.0,
        };
        rect4.layout_child = Some(LayoutChildStyle {
            layout_positioning: LayoutPositioning::Absolute,
            layout_grow: 0.0,
        });
        let child4_id = graph.append_child(Node::Rectangle(rect4), Parent::NodeId(container_id));

        // Relative child 3
        let mut rect5 = nf.create_rectangle_node();
        rect5.size = Size {
            width: 100.0,
            height: 50.0,
        };
        let child5_id = graph.append_child(Node::Rectangle(rect5), Parent::NodeId(container_id));

        // Compute layout
        let scene = Scene {
            name: "test".to_string(),
            graph,
            background_color: None,
        };
        let mut engine = LayoutEngine::new();
        let result = engine.compute(
            &scene,
            Size {
                width: 800.0,
                height: 600.0,
            },
            None,
        );

        // Verify all children get layout results (Taffy handles both relative and absolute)
        assert!(
            result.get(&child1_id).is_some(),
            "Relative child 1 should have layout"
        );
        assert!(
            result.get(&child2_id).is_some(),
            "Absolute child 2 should have layout (Taffy positions it)"
        );
        assert!(
            result.get(&child3_id).is_some(),
            "Relative child 3 should have layout"
        );
        assert!(
            result.get(&child4_id).is_some(),
            "Absolute child 4 should have layout (Taffy positions it)"
        );
        assert!(
            result.get(&child5_id).is_some(),
            "Relative child 5 should have layout"
        );

        // Verify vertical layout for relative children (absolute children don't affect flex flow)
        let layout1 = result.get(&child1_id).unwrap();
        let layout3 = result.get(&child3_id).unwrap();
        let layout5 = result.get(&child5_id).unwrap();

        // Vertical positioning: y=0, y=70 (50+20), y=140 (50+20+50+20)
        // Absolute children are ignored in flex flow calculations
        assert_eq!(layout1.y, 0.0, "First relative child at y=0");
        assert_eq!(
            layout3.y, 70.0,
            "Second relative child at y=70 (50 + 20 gap, ignoring absolute in flow)"
        );
        assert_eq!(
            layout5.y, 140.0,
            "Third relative child at y=140 (50 + 20 + 50 + 20, ignoring absolute in flow)"
        );
    }

    #[test]
    fn test_root_positioning_integration() {
        // Test: SceneGraph + LayoutEngine + GeometryCache integration
        // Verifies root containers and rectangles respect schema positions
        let nf = NodeFactory::new();
        let mut graph = SceneGraph::new();

        // Root container at (100, 50)
        let mut container = nf.create_container_node();
        container.position = LayoutPositioningBasis::Cartesian(CGPoint::new(100.0, 50.0));
        container.layout_dimensions.layout_target_width = Some(200.0);
        container.layout_dimensions.layout_target_height = Some(100.0);
        let container_id = graph.append_child(Node::Container(container), Parent::Root);

        // Root rectangle at (300, 150)
        let mut rect = nf.create_rectangle_node();
        rect.transform = AffineTransform::new(300.0, 150.0, 0.0);
        rect.size = Size {
            width: 100.0,
            height: 80.0,
        };
        let rect_id = graph.append_child(Node::Rectangle(rect), Parent::Root);

        let scene = Scene {
            name: "test".to_string(),
            graph,
            background_color: None,
        };

        // Compute layout
        let mut engine = LayoutEngine::new();
        let layout_result = engine.compute(
            &scene,
            Size {
                width: 800.0,
                height: 600.0,
            },
            None,
        );

        // Verify: Layout results have corrected positions
        let container_layout = layout_result.get(&container_id).unwrap();
        assert_eq!(container_layout.x, 100.0, "Root container x from schema");
        assert_eq!(container_layout.y, 50.0, "Root container y from schema");

        let rect_layout = layout_result.get(&rect_id).unwrap();
        assert_eq!(rect_layout.x, 300.0, "Root rectangle x from schema");
        assert_eq!(rect_layout.y, 150.0, "Root rectangle y from schema");

        // Verify: GeometryCache uses corrected positions
        use crate::cache::paragraph::ParagraphCache;
        use crate::resources::ByteStore;
        use crate::runtime::font_repository::FontRepository;
        use std::sync::{Arc, Mutex};

        let store = Arc::new(Mutex::new(ByteStore::new()));
        let fonts = FontRepository::new(store);
        let mut para_cache = ParagraphCache::new();
        let geom = crate::cache::geometry::GeometryCache::from_scene_with_layout(
            &scene,
            &mut para_cache,
            &fonts,
            Some(layout_result),
            Size {
                width: 800.0,
                height: 600.0,
            },
        );

        let container_transform = geom.get_transform(&container_id).unwrap();
        assert_eq!(container_transform.x(), 100.0);
        assert_eq!(container_transform.y(), 50.0);

        let rect_transform = geom.get_transform(&rect_id).unwrap();
        assert_eq!(rect_transform.x(), 300.0);
        assert_eq!(rect_transform.y(), 150.0);
    }

    #[test]
    fn test_svgpath_positioning() {
        // Verify that SVGPath nodes without layout_child are positioned using their transform
        let nf = NodeFactory::new();
        let mut graph = SceneGraph::new();

        // Create an SVGPath node with transform coordinates
        let mut svgpath = nf.create_path_node();
        svgpath.data = "M 0 0 L 100 0 L 100 100 L 0 100 Z".to_string();
        svgpath.transform = AffineTransform::new(200.0, 150.0, 0.0);
        // layout_child is None by default

        let svgpath_id = graph.append_child(Node::Path(svgpath), Parent::Root);

        let scene = Scene {
            name: "SVGPath positioning test".to_string(),
            graph,
            background_color: None,
        };

        // Compute layout
        let mut engine = LayoutEngine::new();
        let result = engine.compute(
            &scene,
            Size {
                width: 1000.0,
                height: 1000.0,
            },
            None,
        );

        // Verify position is correct
        let layout = result.get(&svgpath_id).expect("SVGPath should have layout");
        assert_eq!(
            layout.x, 200.0,
            "SVGPath should be positioned at transform.x"
        );
        assert_eq!(
            layout.y, 150.0,
            "SVGPath should be positioned at transform.y"
        );
    }

    #[test]
    fn test_vector_positioning() {
        // Verify that Vector nodes without layout_child are positioned using their transform
        use crate::vectornetwork::*;
        let mut graph = SceneGraph::new();

        // Create a Vector node with transform coordinates
        let vector_node = VectorNodeRec {
            active: true,
            opacity: 1.0,
            blend_mode: LayerBlendMode::default(),
            mask: None,
            effects: LayerEffects::default(),
            transform: AffineTransform::new(300.0, 250.0, 0.0),
            network: VectorNetwork {
                vertices: vec![(0.0, 0.0), (100.0, 0.0), (100.0, 100.0), (0.0, 100.0)],
                segments: vec![
                    VectorNetworkSegment::ab(0, 1),
                    VectorNetworkSegment::ab(1, 2),
                    VectorNetworkSegment::ab(2, 3),
                    VectorNetworkSegment::ab(3, 0),
                ],
                regions: vec![],
            },
            corner_radius: 0.0,
            fills: Paints::default(),
            strokes: Paints::default(),
            stroke_width: 0.0,
            stroke_width_profile: None,
            stroke_align: StrokeAlign::Inside,
            stroke_cap: StrokeCap::default(),
            stroke_join: StrokeJoin::default(),
            stroke_miter_limit: StrokeMiterLimit::default(),
            stroke_dash_array: None,
            marker_start_shape: StrokeMarkerPreset::default(),
            marker_end_shape: StrokeMarkerPreset::default(),
            layout_child: None,
        };

        let vector_id = graph.append_child(Node::Vector(vector_node), Parent::Root);

        let scene = Scene {
            name: "Vector positioning test".to_string(),
            graph,
            background_color: None,
        };

        // Compute layout
        let mut engine = LayoutEngine::new();
        let result = engine.compute(
            &scene,
            Size {
                width: 1000.0,
                height: 1000.0,
            },
            None,
        );

        // Verify position is correct
        let layout = result.get(&vector_id).expect("Vector should have layout");
        assert_eq!(
            layout.x, 300.0,
            "Vector should be positioned at transform.x"
        );
        assert_eq!(
            layout.y, 250.0,
            "Vector should be positioned at transform.y"
        );
    }

    /// Test: Root-level BooleanOperation with Container descendants
    ///
    /// Reproduces the panic from geometry.rs:307:
    /// "Container must have layout result when layout engine is used"
    ///
    /// BooleanOperation nodes don't participate in Taffy layout, so when one is
    /// a scene root, build_taffy_subtree() returns None. Previously, compute()
    /// would skip extract_all_layouts() entirely for that root, leaving all
    /// descendant containers without layout results.
    #[test]
    fn test_root_boolean_operation_with_container_descendants() {
        use crate::vectornetwork::*;
        let nf = NodeFactory::new();
        let mut graph = SceneGraph::new();

        // Root: BooleanOperation (does NOT participate in Taffy)
        let boolean_node = BooleanPathOperationNodeRec {
            active: true,
            opacity: 1.0,
            blend_mode: LayerBlendMode::default(),
            mask: None,
            effects: LayerEffects::default(),
            transform: Some(AffineTransform::new(10.0, 20.0, 0.0)),
            op: BooleanPathOperation::Union,
            corner_radius: None,
            fills: Paints::default(),
            strokes: Paints::default(),
            stroke_style: StrokeStyle::default(),
            stroke_width: SingularStrokeWidth(None),
        };
        let bool_id = graph.append_child(Node::BooleanOperation(boolean_node), Parent::Root);

        // Child 1: Container (must get layout result)
        let mut container = nf.create_container_node();
        container.layout_dimensions.layout_target_width = Some(200.0);
        container.layout_dimensions.layout_target_height = Some(100.0);
        let container_id = graph.append_child(Node::Container(container), Parent::NodeId(bool_id));

        // Grandchild: Rectangle inside the container
        let mut rect = nf.create_rectangle_node();
        rect.size = Size {
            width: 50.0,
            height: 50.0,
        };
        let rect_id = graph.append_child(Node::Rectangle(rect), Parent::NodeId(container_id));

        // Child 2: Another Container nested deeper
        let mut container2 = nf.create_container_node();
        container2.layout_dimensions.layout_target_width = Some(80.0);
        container2.layout_dimensions.layout_target_height = Some(60.0);
        let container2_id =
            graph.append_child(Node::Container(container2), Parent::NodeId(container_id));

        // Great-grandchild: Vector inside container2
        let vector_node = VectorNodeRec {
            active: true,
            opacity: 1.0,
            blend_mode: LayerBlendMode::default(),
            mask: None,
            effects: LayerEffects::default(),
            transform: AffineTransform::new(0.0, 0.0, 0.0),
            network: VectorNetwork {
                vertices: vec![(0.0, 0.0), (30.0, 0.0), (30.0, 30.0)],
                segments: vec![
                    VectorNetworkSegment::ab(0, 1),
                    VectorNetworkSegment::ab(1, 2),
                    VectorNetworkSegment::ab(2, 0),
                ],
                regions: vec![],
            },
            corner_radius: 0.0,
            fills: Paints::default(),
            strokes: Paints::default(),
            stroke_width: 0.0,
            stroke_width_profile: None,
            stroke_align: StrokeAlign::Inside,
            stroke_cap: StrokeCap::default(),
            stroke_join: StrokeJoin::default(),
            stroke_miter_limit: StrokeMiterLimit::default(),
            stroke_dash_array: None,
            marker_start_shape: StrokeMarkerPreset::default(),
            marker_end_shape: StrokeMarkerPreset::default(),
            layout_child: None,
        };
        let vector_id =
            graph.append_child(Node::Vector(vector_node), Parent::NodeId(container2_id));

        let scene = Scene {
            name: "Root boolean with container descendants".to_string(),
            graph,
            background_color: None,
        };

        // This used to panic: containers under a non-taffy root had no layout results
        let mut engine = LayoutEngine::new();
        let result = engine.compute(
            &scene,
            Size {
                width: 800.0,
                height: 600.0,
            },
            None,
        );

        // All nodes must have layout results
        assert!(
            result.get(&bool_id).is_some(),
            "Root BooleanOperation must have layout result"
        );
        assert!(
            result.get(&container_id).is_some(),
            "Container under BooleanOperation must have layout result"
        );
        assert!(
            result.get(&rect_id).is_some(),
            "Rectangle under Container must have layout result"
        );
        assert!(
            result.get(&container2_id).is_some(),
            "Nested Container must have layout result"
        );
        assert!(
            result.get(&vector_id).is_some(),
            "Vector under nested Container must have layout result"
        );

        // Verify the BooleanOperation gets schema position
        let bool_layout = result.get(&bool_id).unwrap();
        assert_eq!(bool_layout.x, 10.0, "BooleanOperation x from transform");
        assert_eq!(bool_layout.y, 20.0, "BooleanOperation y from transform");

        // Verify container dimensions from schema
        let container_layout = result.get(&container_id).unwrap();
        assert_eq!(container_layout.width, 200.0);
        assert_eq!(container_layout.height, 100.0);

        let container2_layout = result.get(&container2_id).unwrap();
        assert_eq!(container2_layout.width, 80.0);
        assert_eq!(container2_layout.height, 60.0);
    }

    /// Test: Root-level Group with Container descendants
    ///
    /// Same scenario as BooleanOperation — Group also doesn't participate in Taffy.
    #[test]
    fn test_root_group_with_container_descendants() {
        let nf = NodeFactory::new();
        let mut graph = SceneGraph::new();

        // Root: Group (does NOT participate in Taffy)
        let group = nf.create_group_node();
        let group_id = graph.append_child(Node::Group(group), Parent::Root);

        // Child: Container
        let mut container = nf.create_container_node();
        container.layout_dimensions.layout_target_width = Some(150.0);
        container.layout_dimensions.layout_target_height = Some(75.0);
        let container_id = graph.append_child(Node::Container(container), Parent::NodeId(group_id));

        // Grandchild: Rectangle
        let mut rect = nf.create_rectangle_node();
        rect.size = Size {
            width: 40.0,
            height: 40.0,
        };
        let rect_id = graph.append_child(Node::Rectangle(rect), Parent::NodeId(container_id));

        let scene = Scene {
            name: "Root group with container descendants".to_string(),
            graph,
            background_color: None,
        };

        let mut engine = LayoutEngine::new();
        let result = engine.compute(
            &scene,
            Size {
                width: 800.0,
                height: 600.0,
            },
            None,
        );

        // All nodes must have layout results
        assert!(
            result.get(&group_id).is_some(),
            "Root Group must have layout result"
        );
        assert!(
            result.get(&container_id).is_some(),
            "Container under Group must have layout result"
        );
        assert!(
            result.get(&rect_id).is_some(),
            "Rectangle under Container must have layout result"
        );

        let container_layout = result.get(&container_id).unwrap();
        assert_eq!(container_layout.width, 150.0);
        assert_eq!(container_layout.height, 75.0);
    }

    /// Test: Children of a Group retain their schema positions.
    ///
    /// Group children become independent Taffy subtree roots (computed at 0,0).
    /// `extract_all_layouts` detects this via parent-type check and applies
    /// schema-position correction.
    #[test]
    fn test_group_children_retain_schema_positions() {
        let nf = NodeFactory::new();
        let mut graph = SceneGraph::new();

        // Root: Group at (0,0)
        let group = nf.create_group_node();
        let group_id = graph.append_child(Node::Group(group), Parent::Root);

        // Child 1: Container at (0, 35)
        let mut c1 = nf.create_container_node();
        c1.position = LayoutPositioningBasis::Cartesian(CGPoint::new(0.0, 35.0));
        c1.layout_dimensions.layout_target_width = Some(87.0);
        c1.layout_dimensions.layout_target_height = Some(40.0);
        let c1_id = graph.append_child(Node::Container(c1), Parent::NodeId(group_id));

        // Child 2: Container at (102, 0)
        let mut c2 = nf.create_container_node();
        c2.position = LayoutPositioningBasis::Cartesian(CGPoint::new(102.0, 0.0));
        c2.layout_dimensions.layout_target_width = Some(67.0);
        c2.layout_dimensions.layout_target_height = Some(20.0);
        let c2_id = graph.append_child(Node::Container(c2), Parent::NodeId(group_id));

        // Child 3: Container at (189, 0)
        let mut c3 = nf.create_container_node();
        c3.position = LayoutPositioningBasis::Cartesian(CGPoint::new(189.0, 0.0));
        c3.layout_dimensions.layout_target_width = Some(72.0);
        c3.layout_dimensions.layout_target_height = Some(20.0);
        let c3_id = graph.append_child(Node::Container(c3), Parent::NodeId(group_id));

        let scene = Scene {
            name: "Group children positioning".to_string(),
            graph,
            background_color: None,
        };

        let mut engine = LayoutEngine::new();
        let result = engine.compute(
            &scene,
            Size {
                width: 800.0,
                height: 600.0,
            },
            None,
        );

        // Group at origin
        let group_layout = result.get(&group_id).unwrap();
        assert_eq!(group_layout.x, 0.0);
        assert_eq!(group_layout.y, 0.0);

        // Children must keep their schema positions, not collapse to (0,0)
        let c1_layout = result.get(&c1_id).unwrap();
        assert_eq!(c1_layout.x, 0.0, "Child 1 x position");
        assert_eq!(c1_layout.y, 35.0, "Child 1 y position");
        assert_eq!(c1_layout.width, 87.0);
        assert_eq!(c1_layout.height, 40.0);

        let c2_layout = result.get(&c2_id).unwrap();
        assert_eq!(c2_layout.x, 102.0, "Child 2 x position");
        assert_eq!(c2_layout.y, 0.0, "Child 2 y position");

        let c3_layout = result.get(&c3_id).unwrap();
        assert_eq!(c3_layout.x, 189.0, "Child 3 x position");
        assert_eq!(c3_layout.y, 0.0, "Child 3 y position");
    }

    /// Test: Nested Groups (Group → Group → Container) position correctly.
    ///
    /// Verifies that the parent-type check in `extract_all_layouts` handles
    /// arbitrary nesting of virtual grouping nodes.
    #[test]
    fn test_nested_groups_positioning() {
        let nf = NodeFactory::new();
        let mut graph = SceneGraph::new();

        // Root: Outer Group at (10, 20)
        let mut outer = nf.create_group_node();
        outer.transform = Some(AffineTransform::new(10.0, 20.0, 0.0));
        let outer_id = graph.append_child(Node::Group(outer), Parent::Root);

        // Child: Inner Group at (30, 40) relative to outer
        let mut inner = nf.create_group_node();
        inner.transform = Some(AffineTransform::new(30.0, 40.0, 0.0));
        let inner_id = graph.append_child(Node::Group(inner), Parent::NodeId(outer_id));

        // Grandchild: Container at (50, 60) relative to inner
        let mut container = nf.create_container_node();
        container.position = LayoutPositioningBasis::Cartesian(CGPoint::new(50.0, 60.0));
        container.layout_dimensions.layout_target_width = Some(100.0);
        container.layout_dimensions.layout_target_height = Some(80.0);
        let container_id = graph.append_child(Node::Container(container), Parent::NodeId(inner_id));

        let scene = Scene {
            name: "Nested groups".to_string(),
            graph,
            background_color: None,
        };

        let mut engine = LayoutEngine::new();
        let result = engine.compute(
            &scene,
            Size {
                width: 800.0,
                height: 600.0,
            },
            None,
        );

        // Outer group: schema position applied as root
        let outer_layout = result.get(&outer_id).unwrap();
        assert_eq!(outer_layout.x, 10.0, "Outer group x");
        assert_eq!(outer_layout.y, 20.0, "Outer group y");

        // Inner group: positioned at (30, 40) within outer
        let inner_layout = result.get(&inner_id).unwrap();
        assert_eq!(inner_layout.x, 30.0, "Inner group x");
        assert_eq!(inner_layout.y, 40.0, "Inner group y");

        // Container: positioned at (50, 60) within inner
        let container_layout = result.get(&container_id).unwrap();
        assert_eq!(container_layout.x, 50.0, "Container x");
        assert_eq!(container_layout.y, 60.0, "Container y");
        assert_eq!(container_layout.width, 100.0);
        assert_eq!(container_layout.height, 80.0);
    }
}
