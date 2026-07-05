//! Scroll container — offset + clip; painting and hit-testing both
//! respect the clip (`UI-6`).
//!
//! The viewport is a plain engine `Container` with `clip: true` (the
//! same content-clip canvas containers use — no special paint path,
//! `UI-1`); the content is a flex column positioned at `(0, -offset)`
//! inside it, so the **engine's** layout computes every child's
//! geometry, offset included. Hit-testing respects the clip because
//! the [`UiLayer`] intersects each widget's hit rect with its nearest
//! enclosing viewport's rect (the `clip` field collected at build
//! time).
//!
//! Wheel routing: the layer routes a wheel event to the topmost scroll
//! viewport under the pointer; the offset lives in retained state
//! (`UI-2`) and a rebuild reflows the subtree.
//!
//! [`UiLayer`]: crate::ui::UiLayer

use grida::cg::prelude::*;
use grida::node::factory::NodeFactory;
use grida::node::scene_graph::Parent;
use grida::node::schema::*;

use crate::ui::widget::{BuildCtx, Widget, WidgetId, WidgetState};

/// Retained scroll state.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ScrollState {
    /// Vertical scroll offset in logical px (0 = top).
    pub offset: f32,
}

/// A vertical clipping scroll container.
pub struct Scroll {
    pub id: WidgetId,
    /// Viewport size (logical px).
    pub width: f32,
    pub height: f32,
    /// Gap between children in the content column.
    pub gap: f32,
    pub children: Vec<Box<dyn Widget>>,
}

impl Widget for Scroll {
    fn id(&self) -> &WidgetId {
        &self.id
    }

    fn default_state(&self) -> WidgetState {
        WidgetState::Scroll(ScrollState { offset: 0.0 })
    }

    fn build(&self, ctx: &mut BuildCtx, parent: Parent) -> NodeId {
        let offset = match ctx.states.get(&self.id) {
            Some(WidgetState::Scroll(s)) => s.offset,
            _ => 0.0,
        };
        let nf = NodeFactory::new();

        // Viewport: a *flex* container (so the content child rides the
        // engine's Taffy pass — non-flex containers take the schema
        // fast path and skip their subtrees), fixed size, content clip
        // on.
        let mut viewport = nf.create_container_node();
        viewport.layout_container = LayoutContainerStyle {
            layout_mode: LayoutMode::Flex,
            layout_direction: Axis::Vertical,
            ..Default::default()
        };
        viewport.layout_dimensions.layout_target_width = Some(self.width);
        viewport.layout_dimensions.layout_target_height = Some(self.height);
        viewport.fills = Paints::default();
        viewport.clip = true;
        let viewport_id = ctx.graph.append_child(Node::Container(viewport), parent);
        ctx.register_scroll(&self.id, viewport_id);

        // Content: an absolutely-positioned flex column inset at
        // (0, -offset); the engine's layout positions the children and
        // derives the content height.
        let mut content = nf.create_container_node();
        content.position = LayoutPositioningBasis::Cartesian(CGPoint { x: 0.0, y: -offset });
        content.layout_child = Some(LayoutChildStyle {
            layout_positioning: LayoutPositioning::Absolute,
            layout_grow: 0.0,
        });
        content.layout_container = LayoutContainerStyle {
            layout_mode: LayoutMode::Flex,
            layout_direction: Axis::Vertical,
            layout_gap: Some(LayoutGap::uniform(self.gap)),
            ..Default::default()
        };
        content.layout_dimensions.layout_target_width = Some(self.width);
        content.fills = Paints::default();
        content.clip = false;
        let content_id = ctx
            .graph
            .append_child(Node::Container(content), Parent::NodeId(viewport_id));

        ctx.push_clip(viewport_id);
        for child in &self.children {
            child.build(ctx, Parent::NodeId(content_id));
        }
        ctx.pop_clip();

        viewport_id
    }

    fn children(&self) -> &[Box<dyn Widget>] {
        &self.children
    }

    fn children_mut(&mut self) -> Option<&mut Vec<Box<dyn Widget>>> {
        Some(&mut self.children)
    }
}
