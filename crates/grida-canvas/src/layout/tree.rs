use crate::cache::fast_hash::DenseNodeMap;
use crate::cache::paragraph::ParagraphCache;
use crate::cg::types::{AttributedString, TextAlign, TextStyleRec};
use crate::node::schema::NodeId;
use crate::runtime::font_repository::FontRepository;
#[cfg(test)]
use std::collections::HashMap;
use taffy::prelude::*;

/// Context stored for nodes that require custom measurement.
#[derive(Clone)]
pub(crate) enum LayoutNodeContext {
    Text(TextMeasureContext),
    AttributedText(AttributedTextMeasureContext),
    Markdown(MarkdownMeasureContext),
}

/// Measurement inputs for text nodes.
#[derive(Clone)]
pub(crate) struct TextMeasureContext {
    pub scene_node_id: NodeId,
    pub text: String,
    pub text_style: TextStyleRec,
    pub text_align: TextAlign,
    pub max_lines: Option<usize>,
    pub ellipsis: Option<String>,
    pub width: Option<f32>,
    pub height: Option<f32>,
}

/// Measurement inputs for attributed text nodes.
#[derive(Clone)]
pub(crate) struct AttributedTextMeasureContext {
    pub scene_node_id: NodeId,
    pub attributed_string: AttributedString,
    pub text_align: TextAlign,
    pub max_lines: Option<usize>,
    pub ellipsis: Option<String>,
    pub width: Option<f32>,
    pub height: Option<f32>,
}

/// Measurement inputs for markdown embed nodes.
#[derive(Clone)]
pub(crate) struct MarkdownMeasureContext {
    /// The pre-computed styled HTML (from `markdown_to_styled_html`).
    pub styled_html: String,
    pub width: Option<f32>,
    pub height: Option<f32>,
}

/// Shared provider to measure text using the same paragraph cache + fonts as geometry.
pub struct TextMeasureProvider<'a> {
    pub paragraph_cache: &'a mut ParagraphCache,
    pub fonts: &'a FontRepository,
}

/// Integration layer between SceneGraph and TaffyTree
///
/// Maps our NodeId (u64) to Taffy's layout system, enabling
/// flex layout computation while preserving scene graph structure.
pub(crate) struct LayoutTree {
    /// Taffy tree for layout computation
    taffy: TaffyTree<LayoutNodeContext>,
    /// Map from our SceneGraph NodeId to Taffy's NodeId
    scene_to_taffy: DenseNodeMap<taffy::NodeId>,
    /// Reverse map from Taffy NodeId to SceneGraph NodeId (test-only)
    #[cfg(test)]
    taffy_to_scene: HashMap<taffy::NodeId, NodeId>,
}

impl LayoutTree {
    pub(crate) fn new() -> Self {
        Self {
            taffy: TaffyTree::new(),
            scene_to_taffy: DenseNodeMap::new(),
            #[cfg(test)]
            taffy_to_scene: HashMap::new(),
        }
    }

    /// Pre-allocate internal storage for `capacity` nodes.
    ///
    /// Call after `clear()` when the upcoming node count is known.
    /// Avoids repeated reallocation of the taffy slab and both hash maps
    /// during tree construction — significant for large scenes (100k+ nodes).
    pub(crate) fn reserve(&mut self, capacity: usize) {
        // TaffyTree::with_capacity pre-allocates its internal SlotMaps.
        // After clear() the backing vecs keep their old capacity, so we
        // only need to replace the tree when the new count exceeds it.
        if self.scene_to_taffy.capacity() < capacity {
            self.taffy = TaffyTree::with_capacity(capacity);
            self.scene_to_taffy.reserve(capacity);
            #[cfg(test)]
            self.taffy_to_scene.reserve(capacity);
        }
    }

    /// Create a leaf node in the layout tree
    ///
    /// Maps the scene node ID to a taffy node ID and returns it
    pub(crate) fn new_leaf(
        &mut self,
        scene_node_id: NodeId,
        style: Style,
    ) -> Result<taffy::NodeId, taffy::TaffyError> {
        let taffy_id = self.taffy.new_leaf(style)?;
        #[cfg(test)]
        if let Some(old_taffy_id) = self.scene_to_taffy.get(&scene_node_id).copied() {
            self.taffy_to_scene.remove(&old_taffy_id);
        }
        self.scene_to_taffy.insert(scene_node_id, taffy_id);
        #[cfg(test)]
        {
            if let Some(old_scene_id) = self.taffy_to_scene.insert(taffy_id, scene_node_id) {
                self.scene_to_taffy.remove(&old_scene_id);
            }
        }
        Ok(taffy_id)
    }

    /// Create a text leaf node with measurement context.
    pub(crate) fn new_text_leaf(
        &mut self,
        scene_node_id: NodeId,
        style: Style,
        context: TextMeasureContext,
    ) -> Result<taffy::NodeId, taffy::TaffyError> {
        let taffy_id = self
            .taffy
            .new_leaf_with_context(style, LayoutNodeContext::Text(context))?;
        #[cfg(test)]
        if let Some(old_taffy_id) = self.scene_to_taffy.get(&scene_node_id).copied() {
            self.taffy_to_scene.remove(&old_taffy_id);
        }
        self.scene_to_taffy.insert(scene_node_id, taffy_id);
        #[cfg(test)]
        {
            if let Some(old_scene_id) = self.taffy_to_scene.insert(taffy_id, scene_node_id) {
                self.scene_to_taffy.remove(&old_scene_id);
            }
        }
        Ok(taffy_id)
    }

    pub(crate) fn new_attributed_text_leaf(
        &mut self,
        scene_node_id: NodeId,
        style: Style,
        context: AttributedTextMeasureContext,
    ) -> Result<taffy::NodeId, taffy::TaffyError> {
        let taffy_id = self
            .taffy
            .new_leaf_with_context(style, LayoutNodeContext::AttributedText(context))?;
        #[cfg(test)]
        if let Some(old_taffy_id) = self.scene_to_taffy.get(&scene_node_id).copied() {
            self.taffy_to_scene.remove(&old_taffy_id);
        }
        self.scene_to_taffy.insert(scene_node_id, taffy_id);
        #[cfg(test)]
        {
            if let Some(old_scene_id) = self.taffy_to_scene.insert(taffy_id, scene_node_id) {
                self.scene_to_taffy.remove(&old_scene_id);
            }
        }
        Ok(taffy_id)
    }

    /// Create a markdown embed leaf node with measurement context.
    pub(crate) fn new_markdown_leaf(
        &mut self,
        scene_node_id: NodeId,
        style: Style,
        context: MarkdownMeasureContext,
    ) -> Result<taffy::NodeId, taffy::TaffyError> {
        let taffy_id = self
            .taffy
            .new_leaf_with_context(style, LayoutNodeContext::Markdown(context))?;
        #[cfg(test)]
        if let Some(old_taffy_id) = self.scene_to_taffy.get(&scene_node_id).copied() {
            self.taffy_to_scene.remove(&old_taffy_id);
        }
        self.scene_to_taffy.insert(scene_node_id, taffy_id);
        #[cfg(test)]
        {
            if let Some(old_scene_id) = self.taffy_to_scene.insert(taffy_id, scene_node_id) {
                self.scene_to_taffy.remove(&old_scene_id);
            }
        }
        Ok(taffy_id)
    }

    /// Create a container node with children
    ///
    /// Maps the scene node ID to a taffy node ID and returns it
    pub(crate) fn new_with_children(
        &mut self,
        scene_node_id: NodeId,
        style: Style,
        children: &[taffy::NodeId],
    ) -> Result<taffy::NodeId, taffy::TaffyError> {
        let taffy_id = self.taffy.new_with_children(style, children)?;
        #[cfg(test)]
        if let Some(old_taffy_id) = self.scene_to_taffy.get(&scene_node_id).copied() {
            self.taffy_to_scene.remove(&old_taffy_id);
        }
        self.scene_to_taffy.insert(scene_node_id, taffy_id);
        #[cfg(test)]
        {
            if let Some(old_scene_id) = self.taffy_to_scene.insert(taffy_id, scene_node_id) {
                self.scene_to_taffy.remove(&old_scene_id);
            }
        }
        Ok(taffy_id)
    }

    /// Compute layout for the tree
    pub(crate) fn compute_layout(
        &mut self,
        root: taffy::NodeId,
        available_space: Size<AvailableSpace>,
        measure_provider: Option<&mut TextMeasureProvider<'_>>,
    ) -> Result<(), taffy::TaffyError> {
        if let Some(provider) = measure_provider {
            self.taffy.compute_layout_with_measure(
                root,
                available_space,
                move |known_dimensions, _available_space, _node_id, node_context, _style| {
                    if let Some(LayoutNodeContext::Text(ctx)) = node_context {
                        let width_constraint = known_dimensions.width.or(ctx.width);

                        let measurements = provider.paragraph_cache.measure(
                            &ctx.text,
                            &ctx.text_style,
                            &ctx.text_align,
                            &ctx.max_lines,
                            &ctx.ellipsis,
                            width_constraint,
                            provider.fonts,
                            Some(&ctx.scene_node_id),
                        );

                        let width = width_constraint.unwrap_or(measurements.max_width);
                        let measured_height = ctx.height.unwrap_or(measurements.height);
                        let height = known_dimensions.height.unwrap_or(measured_height);

                        Size {
                            width: width.max(1.0),
                            height: height.max(1.0),
                        }
                    } else if let Some(LayoutNodeContext::AttributedText(ctx)) = node_context {
                        let width_constraint = known_dimensions.width.or(ctx.width);

                        let measurements = provider.paragraph_cache.measure_attributed(
                            &ctx.attributed_string,
                            &ctx.text_align,
                            &ctx.max_lines,
                            &ctx.ellipsis,
                            width_constraint,
                            provider.fonts,
                            Some(&ctx.scene_node_id),
                        );

                        let width = width_constraint.unwrap_or(measurements.max_width);
                        let measured_height = ctx.height.unwrap_or(measurements.height);
                        let height = known_dimensions.height.unwrap_or(measured_height);

                        Size {
                            width: width.max(1.0),
                            height: height.max(1.0),
                        }
                    } else if let Some(LayoutNodeContext::Markdown(ctx)) = node_context {
                        let width = known_dimensions.width.or(ctx.width).unwrap_or(400.0); // fallback width for measurement

                        let measured_height = crate::htmlcss::measure_content_height(
                            &ctx.styled_html,
                            width,
                            provider.fonts,
                        )
                        .unwrap_or(0.0);

                        let height = known_dimensions
                            .height
                            .or(ctx.height)
                            .unwrap_or(measured_height);

                        Size {
                            width: width.max(1.0),
                            height: height.max(1.0),
                        }
                    } else {
                        Size {
                            width: known_dimensions.width.unwrap_or(0.0),
                            height: known_dimensions.height.unwrap_or(0.0),
                        }
                    }
                },
            )
        } else {
            self.taffy.compute_layout(root, available_space)
        }
    }

    /// Get computed layout for a scene node
    pub(crate) fn get_layout(&self, scene_node_id: &NodeId) -> Option<&Layout> {
        self.scene_to_taffy
            .get(scene_node_id)
            .and_then(|taffy_id| self.taffy.layout(*taffy_id).ok())
    }

    /// Get the taffy NodeId for a scene NodeId
    #[cfg(test)]
    pub(crate) fn get_taffy_id(&self, scene_node_id: &NodeId) -> Option<taffy::NodeId> {
        self.scene_to_taffy.get(scene_node_id).copied()
    }

    /// Get the scene NodeId for a taffy NodeId
    #[cfg(test)]
    pub(crate) fn get_scene_id(&self, taffy_id: &taffy::NodeId) -> Option<NodeId> {
        self.taffy_to_scene.get(taffy_id).copied()
    }

    /// Clear the tree
    #[allow(dead_code)]
    pub(crate) fn clear(&mut self) {
        self.taffy.clear();
        self.scene_to_taffy.clear();
        #[cfg(test)]
        self.taffy_to_scene.clear();
    }

    /// Get number of nodes in the layout tree
    #[allow(dead_code)]
    pub(crate) fn len(&self) -> usize {
        self.scene_to_taffy.len()
    }

    /// Check if the layout tree is empty
    #[allow(dead_code)]
    pub(crate) fn is_empty(&self) -> bool {
        self.scene_to_taffy.is_empty()
    }

    /// Access the underlying taffy tree directly
    ///
    /// Use this when you need to perform operations not wrapped by LayoutTree
    #[allow(dead_code)]
    pub(crate) fn taffy(&self) -> &TaffyTree<LayoutNodeContext> {
        &self.taffy
    }

    /// Mutable access to the underlying taffy tree
    #[allow(dead_code)]
    pub(crate) fn taffy_mut(&mut self) -> &mut TaffyTree<LayoutNodeContext> {
        &mut self.taffy
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_layout_tree_creation() {
        let mut tree = LayoutTree::new();

        // Create a simple leaf node
        let node_id: NodeId = 1;
        let style = Style {
            size: Size {
                width: Dimension::length(100.0),
                height: Dimension::length(100.0),
            },
            ..Default::default()
        };

        let taffy_id = tree.new_leaf(node_id, style).unwrap();
        assert!(tree.get_taffy_id(&node_id).is_some());
        assert_eq!(tree.get_taffy_id(&node_id).unwrap(), taffy_id);
    }

    #[test]
    fn test_layout_tree_with_children() {
        let mut tree = LayoutTree::new();

        // Create child nodes
        let child1_id: NodeId = 1;
        let child2_id: NodeId = 2;
        let parent_id: NodeId = 3;

        let child_style = Style {
            size: Size {
                width: Dimension::length(50.0),
                height: Dimension::length(50.0),
            },
            ..Default::default()
        };

        let child1_taffy = tree.new_leaf(child1_id, child_style.clone()).unwrap();
        let child2_taffy = tree.new_leaf(child2_id, child_style).unwrap();

        // Create parent with children
        let parent_style = Style {
            display: Display::Flex,
            flex_direction: FlexDirection::Row,
            size: Size {
                width: Dimension::length(200.0),
                height: Dimension::length(100.0),
            },
            ..Default::default()
        };

        let parent_taffy = tree
            .new_with_children(parent_id, parent_style, &[child1_taffy, child2_taffy])
            .unwrap();

        // Compute layout
        tree.compute_layout(
            parent_taffy,
            Size {
                width: AvailableSpace::Definite(200.0),
                height: AvailableSpace::Definite(100.0),
            },
            None,
        )
        .unwrap();

        // Verify we can retrieve layouts
        let child1_layout = tree.get_layout(&child1_id).unwrap();
        let child2_layout = tree.get_layout(&child2_id).unwrap();

        assert_eq!(child1_layout.size.width, 50.0);
        assert_eq!(child1_layout.size.height, 50.0);
        assert_eq!(child2_layout.size.width, 50.0);
        assert_eq!(child2_layout.size.height, 50.0);

        // Children should be laid out horizontally
        assert_eq!(child1_layout.location.x, 0.0);
        assert_eq!(child2_layout.location.x, 50.0);
    }

    #[test]
    fn test_layout_tree_compute_noop() {
        // Test with non-responsive styles (fixed sizes)
        // This validates the integration works even though styles aren't responsive yet
        let mut tree = LayoutTree::new();

        let node_id: NodeId = 100;
        let style = Style {
            size: Size {
                width: Dimension::length(300.0),
                height: Dimension::length(200.0),
            },
            ..Default::default()
        };

        let taffy_id = tree.new_leaf(node_id, style).unwrap();

        tree.compute_layout(
            taffy_id,
            Size {
                width: AvailableSpace::Definite(1000.0),
                height: AvailableSpace::Definite(1000.0),
            },
            None,
        )
        .unwrap();

        let layout = tree.get_layout(&node_id).unwrap();

        // Fixed size should remain unchanged regardless of available space
        assert_eq!(layout.size.width, 300.0);
        assert_eq!(layout.size.height, 200.0);
        assert_eq!(layout.location.x, 0.0);
        assert_eq!(layout.location.y, 0.0);
    }

    #[test]
    fn test_mapping_cleanup_on_reinsertion() {
        let mut tree = LayoutTree::new();

        let scene_id: NodeId = 1;
        let style = Style {
            size: Size {
                width: Dimension::length(100.0),
                height: Dimension::length(100.0),
            },
            ..Default::default()
        };

        // First insertion
        let taffy_id1 = tree.new_leaf(scene_id, style.clone()).unwrap();

        // Verify initial mapping
        assert_eq!(tree.get_taffy_id(&scene_id), Some(taffy_id1));
        assert_eq!(tree.get_scene_id(&taffy_id1), Some(scene_id));
        assert_eq!(tree.len(), 1);

        // Re-insert the same scene_id with a new style
        let new_style = Style {
            size: Size {
                width: Dimension::length(200.0),
                height: Dimension::length(200.0),
            },
            ..Default::default()
        };
        let taffy_id2 = tree.new_leaf(scene_id, new_style).unwrap();

        // Verify the old taffy_id is no longer mapped
        assert_eq!(tree.get_scene_id(&taffy_id1), None);

        // Verify the new taffy_id is correctly mapped
        assert_eq!(tree.get_taffy_id(&scene_id), Some(taffy_id2));
        assert_eq!(tree.get_scene_id(&taffy_id2), Some(scene_id));

        // Should still have only one mapping
        assert_eq!(tree.len(), 1);
    }

    #[test]
    fn test_mapping_cleanup_with_different_scene_ids() {
        let mut tree = LayoutTree::new();

        let scene_id1: NodeId = 1;
        let scene_id2: NodeId = 2;
        let style = Style {
            size: Size {
                width: Dimension::length(100.0),
                height: Dimension::length(100.0),
            },
            ..Default::default()
        };

        // Create first mapping
        let taffy_id1 = tree.new_leaf(scene_id1, style.clone()).unwrap();

        // Create second mapping with different scene_id
        let taffy_id2 = tree.new_leaf(scene_id2, style.clone()).unwrap();

        // Verify both mappings exist
        assert_eq!(tree.get_taffy_id(&scene_id1), Some(taffy_id1));
        assert_eq!(tree.get_taffy_id(&scene_id2), Some(taffy_id2));
        assert_eq!(tree.len(), 2);

        // Now re-insert scene_id2 with a new style (this should clean up the old mapping for scene_id2)
        let new_style = Style {
            size: Size {
                width: Dimension::length(200.0),
                height: Dimension::length(200.0),
            },
            ..Default::default()
        };
        let taffy_id3 = tree.new_leaf(scene_id2, new_style).unwrap();

        // scene_id1 should still be mapped to taffy_id1
        assert_eq!(tree.get_taffy_id(&scene_id1), Some(taffy_id1));
        assert_eq!(tree.get_scene_id(&taffy_id1), Some(scene_id1));

        // scene_id2 should now be mapped to taffy_id3 (not taffy_id2)
        assert_eq!(tree.get_taffy_id(&scene_id2), Some(taffy_id3));
        assert_eq!(tree.get_scene_id(&taffy_id3), Some(scene_id2));

        // taffy_id2 should no longer be mapped to anything
        assert_eq!(tree.get_scene_id(&taffy_id2), None);

        // Should still have two mappings
        assert_eq!(tree.len(), 2);
    }
}
