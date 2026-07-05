//! `section_header` — a bold, dark title line that opens a group of rows
//! inside a panel. Structurally a [`Row`](super::row::Row) (a horizontal
//! line with an optional right-aligned action control), but its label is
//! rendered heavier and darker so a section reads as distinct from the
//! property rows beneath it. Looks are fixed and hardcoded (dumbness
//! doctrine: no styling system) — this is the one "heading" look.

use grida::cg::prelude::*;
use grida::node::factory::NodeFactory;
use grida::node::scene_graph::Parent;
use grida::node::schema::*;

use crate::ui::widget::{BuildCtx, Widget, WidgetId};

pub struct SectionHeader {
    pub id: WidgetId,
    pub label: String,
    pub width: f32,
    pub height: f32,
    /// The section action (0 or 1 widgets — an add button or an enable
    /// toggle), right-aligned; a `Vec` for replace-in-place parity with
    /// [`Row`](super::row::Row).
    pub children: Vec<Box<dyn Widget>>,
}

impl Widget for SectionHeader {
    fn id(&self) -> &WidgetId {
        &self.id
    }

    fn build(&self, ctx: &mut BuildCtx, parent: Parent) -> NodeId {
        // Shares the row scaffold (super::row::hrow); only the label look
        // below diverges — that's the whole point of the heading widget.
        let node = super::row::hrow(ctx, parent, &self.id, self.width, self.height);

        let nf = NodeFactory::new();
        let mut label = nf.create_text_span_node();
        label.text = self.label.clone();
        label.width = Some(self.width - 28.0);
        label.height = Some(16.0);
        // Heavier + larger + near-black — the contrast that separates a
        // section title from the grey property-row labels below it.
        let mut style = TextStyleRec::from_font("Geist", 12.0);
        style.font_weight = FontWeight::BOLD700;
        label.text_style = style;
        label.fills = Paints::new([Paint::Solid(SolidPaint::new_color(CGColor::from_rgba(
            28, 28, 28, 255,
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
