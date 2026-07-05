//! `row` — a label + control line inside a panel.

use grida::cg::prelude::*;
use grida::node::factory::NodeFactory;
use grida::node::scene_graph::Parent;
use grida::node::schema::*;

use crate::ui::widget::{BuildCtx, Widget, WidgetId};

pub struct Row {
    pub id: WidgetId,
    pub label: String,
    pub width: f32,
    pub height: f32,
    /// The control (0 or 1 widgets; a `Vec` so the config is
    /// replaceable in place, see [`Widget::children_mut`]).
    pub children: Vec<Box<dyn Widget>>,
}

impl Widget for Row {
    fn id(&self) -> &WidgetId {
        &self.id
    }

    fn build(&self, ctx: &mut BuildCtx, parent: Parent) -> NodeId {
        let nf = NodeFactory::new();
        let mut row = nf.create_container_node();
        row.layout_container = LayoutContainerStyle {
            layout_mode: LayoutMode::Flex,
            layout_direction: Axis::Horizontal,
            layout_gap: Some(LayoutGap::uniform(8.0)),
            layout_cross_axis_alignment: Some(CrossAxisAlignment::Center),
            ..Default::default()
        };
        row.layout_dimensions.layout_target_width = Some(self.width);
        row.layout_dimensions.layout_target_height = Some(self.height);
        row.fills = Paints::default();
        row.clip = false;
        let node = ctx.graph.append_child(Node::Container(row), parent);
        ctx.register(&self.id, node, false, false);

        let nf = NodeFactory::new();
        let mut label = nf.create_text_span_node();
        label.text = self.label.clone();
        label.width = Some(64.0);
        label.height = Some(14.0);
        label.text_style = TextStyleRec::from_font("Geist", 11.0);
        label.fills = Paints::new([Paint::Solid(SolidPaint::new_color(CGColor::from_rgba(
            90, 90, 90, 255,
        )))]);
        ctx.graph
            .append_child(Node::TextSpan(label), Parent::NodeId(node));

        for child in &self.children {
            child.build(ctx, Parent::NodeId(node));
        }
        node
    }

    fn children(&self) -> &[Box<dyn Widget>] {
        &self.children
    }

    fn children_mut(&mut self) -> Option<&mut Vec<Box<dyn Widget>>> {
        Some(&mut self.children)
    }
}
