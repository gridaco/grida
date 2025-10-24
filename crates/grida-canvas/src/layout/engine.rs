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
//! ## Pipeline Guarantees
//!
//! This module guarantees:
//! - Every node gets a layout result (either computed or static)
//! - Layout results are complete before Geometry phase begins
//! - Missing layout results indicate a bug in the layout engine

use crate::layout::cache::LayoutResult;
use crate::layout::tree::LayoutTree;
use crate::layout::ComputedLayout;
use crate::node::scene_graph::SceneGraph;
use crate::node::schema::{Node, NodeId, Size};
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

    /// Recursively build Taffy tree for a node and its descendants
    ///
    /// This universal method handles all node types without switch-case logic.
    /// Each node gets an appropriate Taffy style based on its type and properties.
    fn build_taffy_subtree(
        &mut self,
        node_id: &NodeId,
        graph: &SceneGraph,
        viewport_size: Size,
    ) -> Option<taffy::NodeId> {
        let node = graph.get_node(node_id).ok()?;

        // Get style for this node (universal mapping)
        let mut style = crate::layout::into_taffy::node_to_taffy_style(node, graph, node_id);

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
                // Build children recursively
                let mut taffy_children = Vec::new();
                for child_id in children {
                    if let Some(child_taffy) =
                        self.build_taffy_subtree(child_id, graph, viewport_size)
                    {
                        taffy_children.push(child_taffy);
                    }
                }

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
    fn extract_all_layouts(&mut self, id: &NodeId, graph: &SceneGraph) {
        // Extract this node's layout if it exists in the Taffy tree
        if let Some(layout) = self.tree.get_layout(id) {
            self.result.insert(*id, ComputedLayout::from(layout));
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
    use crate::cg::types::{Axis, LayoutGap, LayoutMode};
    use crate::node::factory::NodeFactory;
    use crate::node::scene_graph::{Parent, SceneGraph};
    use crate::node::schema::*;

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
}
