//! `label` — a fixed-size text span. Not interactive; registered so
//! the panel can rebuild it by identity (`PROP-7` granularity).

use grida::cg::prelude::*;
use grida::node::factory::NodeFactory;
use grida::node::scene_graph::Parent;
use grida::node::schema::*;

use crate::ui::widget::{BuildCtx, Widget, WidgetId};

pub struct Label {
    pub id: WidgetId,
    pub text: String,
    pub width: f32,
    pub height: f32,
    pub font_size: f32,
}

impl Label {
    pub fn new(id: impl Into<WidgetId>, text: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            text: text.into(),
            width: 200.0,
            height: 16.0,
            font_size: 12.0,
        }
    }
}

impl Widget for Label {
    fn id(&self) -> &WidgetId {
        &self.id
    }

    fn build(&self, ctx: &mut BuildCtx, parent: Parent) -> NodeId {
        let nf = NodeFactory::new();
        let mut text = nf.create_text_span_node();
        text.text = self.text.clone();
        // Explicit bounds: layout never depends on font measurement,
        // so the tree is deterministic headlessly (`UI-7`).
        text.width = Some(self.width);
        text.height = Some(self.height);
        text.text_style = TextStyleRec::from_font("Geist", self.font_size);
        text.fills = Paints::new([Paint::Solid(SolidPaint::new_color(CGColor::from_rgba(
            40, 40, 40, 255,
        )))]);
        let node = ctx.graph.append_child(Node::TextSpan(text), parent);
        ctx.register(&self.id, node, false, false);
        node
    }
}
