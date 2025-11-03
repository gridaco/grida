//! Universal Layout Engine
//!
//! This module provides a universal layout computation engine that handles all node types
//! without switch-case logic. Every node in the scene graph participates in layout computation
//! with appropriate Taffy styles based on their type and properties.
//!
//! ## Universal Design
//!
//! - **No switch-case logic**: All node types are handled uniformly through `node_to_taffy_style()`
//! - **Extensible**: Adding layout support to new node types requires only adding a case to the style mapping
//! - **ICB-less support**: Works with or without InitialContainerBlock, supports any node as root
//! - **Future-proof**: Clear path to support layout on all node types
//!
//! ## Infinite Canvas Support
//!
//! Grida is an infinite canvas with layout capabilities. Root nodes can be positioned anywhere
//! in the viewport (like artboards in design tools), while their children participate in flex layout.
//!
//! ### The Challenge
//!
//! Taffy (our layout library) cannot position tree roots using `position: absolute` with `inset`
//! because roots have no containing block. Taffy always computes root nodes at (0, 0).
//!
//! ### The Solution
//!
//! **Post-processing in `extract_all_layouts()`**:
//! 1. Taffy computes all layouts (roots at 0,0, children correctly positioned)
//! 2. `extract_all_layouts()` detects root nodes via `graph.is_root()`
//! 3. Root positions are overridden with schema positions via `get_schema_position()`
//! 4. GeometryCache consumes corrected layout results (no special cases needed)
//!
//! This keeps **all infinite canvas logic in LayoutEngine**, maintaining clean separation:
//! - **LayoutEngine**: Owns layout computation AND infinite canvas positioning
//! - **GeometryCache**: Transforms layout results to geometry (no layout concerns)
//!
//! See `test_root_positioning_integration()` for the full pipeline verification.
//!
//! ## Pipeline Guarantees
//!
//! This module guarantees:
//! - Every node gets a layout result (either computed or static)
//! - Root node positions are corrected to schema positions (infinite canvas)
//! - Layout results are complete before Geometry phase begins
//! - Missing layout results indicate a bug in the layout engine

use crate::layout::cache::LayoutResult;
use crate::layout::tree::LayoutTree;
use crate::layout::ComputedLayout;
use crate::node::scene_graph::SceneGraph;
use crate::node::schema::{Node, NodeId, NodeRectMixin, Size};
use taffy::prelude::*;

/// Universal Layout Engine
///
/// Responsible for computing layouts for all node types in the scene graph.
/// Uses a universal approach where every node participates in layout computation
/// with appropriate Taffy styles. Owns the LayoutTree (taffy integration) and
/// caches results between frames.
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
    ) -> &LayoutResult {
        // Clear previous state
        self.tree.clear();
        self.result.clear();

        let graph = &scene.graph;
        let roots: Vec<NodeId> = graph.roots().to_vec();

        // Build and compute layout for each root subtree
        for root_id in &roots {
            if let Some(root_taffy_id) = self.build_taffy_subtree(root_id, graph, viewport_size) {
                // Compute layout with viewport as available space
                let _ = self.tree.compute_layout(
                    root_taffy_id,
                    taffy::Size {
                        width: AvailableSpace::Definite(viewport_size.width),
                        height: AvailableSpace::Definite(viewport_size.height),
                    },
                );

                // Extract all computed layouts
                self.extract_all_layouts(root_id, graph);
            }
        }

        &self.result
    }

    /// Get the full layout result
    pub fn result(&self) -> &LayoutResult {
        &self.result
    }

    /// Extract schema width, height from any node type
    fn get_schema_size(node: &Node) -> (f32, f32) {
        match node {
            Node::Container(n) => (
                n.layout_dimensions.width.unwrap_or(0.0),
                n.layout_dimensions.height.unwrap_or(0.0),
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
            Node::Vector(n) => {
                let rect = n.network.bounds();
                (rect.width, rect.height)
            }
            Node::SVGPath(n) => {
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
            Node::Vector(n) => (n.transform.x(), n.transform.y()),
            Node::SVGPath(n) => (n.transform.x(), n.transform.y()),
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

    /// Check if a node should participate in Taffy layout
    ///
    /// Nodes that should be in Taffy tree:
    /// - Layout containers (Container, ICB) - need to lay out children
    /// - Nodes with layout_child field - can participate as flex children
    ///
    /// Nodes skipped from Taffy (use manual schema layout):
    /// - Group, BooleanOperation - no layout_child support (size derived from children)
    fn should_participate_in_taffy(node: &Node) -> bool {
        matches!(
            node,
            Node::Container(_)
                | Node::InitialContainer(_)
                | Node::Rectangle(_)
                | Node::Ellipse(_)
                | Node::Image(_)
                | Node::Line(_)
                | Node::Polygon(_)
                | Node::RegularPolygon(_)
                | Node::RegularStarPolygon(_)
                | Node::TextSpan(_)
                | Node::Error(_)
                | Node::Vector(_)
                | Node::SVGPath(_)
        )
    }

    /// Recursively build Taffy tree for a node and its descendants
    ///
    /// This universal method handles all node types without switch-case logic.
    /// Each node gets an appropriate Taffy style based on its type and properties.
    ///
    /// Nodes without layout_child support are skipped from Taffy tree but still
    /// get layout results created manually from their schema.
    fn build_taffy_subtree(
        &mut self,
        node_id: &NodeId,
        graph: &SceneGraph,
        viewport_size: Size,
    ) -> Option<taffy::NodeId> {
        let node = graph.get_node(node_id).ok()?;

        // Nodes that don't participate in Taffy layout (Vector, SVGPath, Group, etc.)
        // are skipped and get manual layout results created in extract_all_layouts()
        if !Self::should_participate_in_taffy(node) {
            return None; // Skip Taffy, use manual layout result from schema
        }

        // Get style for this node (universal mapping)
        // Note: Absolutely positioned children are still included in the tree,
        // Taffy handles them specially (removes them from flex flow but computes their position)
        let mut style = crate::layout::into_taffy::node_to_taffy_style(node, graph, node_id);

        // Note: Root nodes are laid out by Taffy at (0,0)
        // extract_all_layouts() post-processes to apply schema positions

        // Special handling for root ICB nodes - use viewport size
        if let Node::InitialContainer(_) = node {
            style.size = taffy::Size {
                width: Dimension::length(viewport_size.width),
                height: Dimension::length(viewport_size.height),
            };
        }

        // Check if node has children
        let children = graph.get_children(node_id);

        if let Some(children) = children {
            if !children.is_empty() {
                // Build children recursively, filtering out those that shouldn't participate
                let taffy_children: Vec<taffy::NodeId> = children
                    .iter()
                    .filter_map(|child_id| self.build_taffy_subtree(child_id, graph, viewport_size))
                    .collect();

                // Create parent with children
                return self
                    .tree
                    .new_with_children(*node_id, style, &taffy_children)
                    .ok();
            }
        }

        // Leaf node
        self.tree.new_leaf(*node_id, style).ok()
    }

    /// Recursively extract all computed layouts from the Taffy tree
    ///
    /// **Infinite Canvas Support**: Root nodes have their positions corrected here.
    ///
    /// Taffy computes all tree roots at (0, 0) because they have no containing block.
    /// For infinite canvas support, we override root positions with their schema positions
    /// so multiple artboards/nodes can be positioned anywhere in the viewport.
    ///
    /// **Non-Layout Nodes**: Nodes without layout_child field (Vector, SVGPath, Group, etc.)
    /// are skipped from Taffy tree. We create manual layout results from their schema here.
    ///
    /// Child nodes use Taffy's computed positions unchanged (correct flex/absolute layout).
    fn extract_all_layouts(&mut self, id: &NodeId, graph: &SceneGraph) {
        // Extract this node's layout if it exists in the Taffy tree
        if let Some(layout) = self.tree.get_layout(id) {
            let mut computed = ComputedLayout::from(layout);

            // Apply schema position for root nodes (Taffy computes roots at 0,0)
            if graph.is_root(id) {
                if let Ok(node) = graph.get_node(id) {
                    let (schema_x, schema_y) = Self::get_schema_position(node);
                    computed.x = schema_x;
                    computed.y = schema_y;
                }
            }

            self.result.insert(*id, computed);
        } else {
            // Node not in Taffy tree (skipped due to no layout_child support)
            // Create manual layout result from schema
            if let Ok(node) = graph.get_node(id) {
                let (x, y) = Self::get_schema_position(node);
                let (width, height) = Self::get_schema_size(node);

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
        }

        // Recurse for children
        if let Some(children) = graph.get_children(id) {
            for child_id in children {
                self.extract_all_layouts(child_id, graph);
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
        container.layout_dimensions.width = Some(300.0);
        container.layout_dimensions.height = Some(200.0);

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
        container.layout_dimensions.width = Some(200.0);
        container.layout_dimensions.height = Some(150.0);

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
        outer.layout_dimensions.width = Some(400.0);
        outer.layout_dimensions.height = Some(200.0);
        let outer_id = graph.append_child(Node::Container(outer), Parent::Root);

        // Inner container (vertical)
        let mut inner = nf.create_container_node();
        inner.layout_container = LayoutContainerStyle {
            layout_mode: LayoutMode::Flex,
            layout_direction: Axis::Vertical,
            ..Default::default()
        };
        inner.layout_dimensions.width = Some(200.0);
        inner.layout_dimensions.height = Some(150.0);
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
        container1.layout_dimensions.width = Some(100.0);
        container1.layout_dimensions.height = Some(100.0);
        let container1_id = graph.append_child(Node::Container(container1), Parent::NodeId(icb_id));

        let mut container2 = nf.create_container_node();
        container2.layout_dimensions.width = Some(100.0);
        container2.layout_dimensions.height = Some(100.0);
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
        container.layout_dimensions.width = Some(300.0);
        container.layout_dimensions.height = Some(100.0);
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
        container1.layout_dimensions.width = Some(200.0);
        container1.layout_dimensions.height = Some(100.0);
        let container1_id = graph.append_child(Node::Container(container1), Parent::Root);

        // Second root container
        let mut container2 = nf.create_container_node();
        container2.layout_dimensions.width = Some(150.0);
        container2.layout_dimensions.height = Some(80.0);
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
        container.layout_dimensions.width = Some(200.0);
        container.layout_dimensions.height = Some(100.0);
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
        container.layout_dimensions.width = Some(200.0);
        container.layout_dimensions.height = Some(100.0);
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
        container.layout_dimensions.width = Some(150.0);
        container.layout_dimensions.height = Some(300.0); // Tall enough to see vertical gap
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
        container.layout_dimensions.width = Some(1000.0);
        container.layout_dimensions.height = Some(1000.0);
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
        container.layout_dimensions.width = Some(400.0);
        container.layout_dimensions.height = Some(200.0);
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
        container.layout_dimensions.width = Some(200.0);
        container.layout_dimensions.height = Some(150.0);
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
        container.layout_dimensions.width = Some(300.0);
        container.layout_dimensions.height = Some(500.0);
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
        container.layout_dimensions.width = Some(200.0);
        container.layout_dimensions.height = Some(100.0);
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

        let svgpath_id = graph.append_child(Node::SVGPath(svgpath), Parent::Root);

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
}
