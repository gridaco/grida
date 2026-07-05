//! `panel` — a titled column at a fixed position; the structural root
//! of a UI region. Its opaque background is what blocks pointer input
//! from reaching the canvas underneath (`UI-5`).
//!
//! Collapsing is deferred with the rest of the panel chrome; this is
//! the M3 titled-column shape.

use grida::cg::prelude::*;
use grida::node::factory::NodeFactory;
use grida::node::scene_graph::Parent;
use grida::node::schema::*;

use crate::ui::widget::{BuildCtx, Widget, WidgetId};

pub struct Panel {
    pub id: WidgetId,
    pub title: String,
    /// Top-left origin in logical screen px.
    pub origin: (f32, f32),
    pub width: f32,
    pub height: f32,
    pub children: Vec<Box<dyn Widget>>,
}

impl Widget for Panel {
    fn id(&self) -> &WidgetId {
        &self.id
    }

    fn build(&self, ctx: &mut BuildCtx, parent: Parent) -> NodeId {
        let nf = NodeFactory::new();
        let mut panel = nf.create_container_node();
        panel.position = LayoutPositioningBasis::Cartesian(CGPoint {
            x: self.origin.0,
            y: self.origin.1,
        });
        panel.layout_container = LayoutContainerStyle {
            layout_mode: LayoutMode::Flex,
            layout_direction: Axis::Vertical,
            layout_gap: Some(LayoutGap::uniform(8.0)),
            layout_padding: Some(EdgeInsets::all(12.0)),
            ..Default::default()
        };
        panel.layout_dimensions.layout_target_width = Some(self.width);
        panel.layout_dimensions.layout_target_height = Some(self.height);
        panel.fills = Paints::new([Paint::Solid(SolidPaint::new_color(CGColor::from_rgba(
            250, 250, 250, 255,
        )))]);
        panel.strokes = Paints::new([Paint::Solid(SolidPaint::new_color(CGColor::from_rgba(
            220, 220, 220, 255,
        )))]);
        panel.stroke_width = StrokeWidth::Uniform(1.0);
        panel.clip = true;
        let node = ctx.graph.append_child(Node::Container(panel), parent);
        // Interactive but with no handler: consumes pointer input so it
        // never falls through to the canvas (UI-5).
        ctx.register(&self.id, node, false, true);

        let nf = NodeFactory::new();
        let mut title = nf.create_text_span_node();
        title.text = self.title.clone();
        title.width = Some(self.width - 24.0);
        title.height = Some(18.0);
        title.text_style = TextStyleRec::from_font("Geist", 13.0);
        title.fills = Paints::new([Paint::Solid(SolidPaint::new_color(CGColor::from_rgba(
            20, 20, 20, 255,
        )))]);
        ctx.graph
            .append_child(Node::TextSpan(title), Parent::NodeId(node));

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
