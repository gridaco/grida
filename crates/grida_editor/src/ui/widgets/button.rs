//! `button` — a labeled click target with an output queue. The
//! toolbar drains the queue (the tree widget's outbox pattern): the
//! widget stays editor-blind, the panel maps clicks to meaning.

use grida::cg::prelude::*;
use grida::node::factory::NodeFactory;
use grida::node::scene_graph::Parent;
use grida::node::schema::*;
use grida::text_edit::session::KeyName;
use math2::rect::Rectangle;

use crate::ui::bind::{Binding, BindingPhase, BindingValue, Emission};
use crate::ui::widget::{BuildCtx, UiResponse, Widget, WidgetEvent, WidgetId, WidgetState};

/// Retained button state: pending (undrained) clicks.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct ButtonState {
    pub clicks: usize,
}

pub struct Button {
    pub id: WidgetId,
    pub label: String,
    /// Highlighted (the toolbar's active tool).
    pub active: bool,
    pub width: f32,
    pub height: f32,
    /// When set, a click emits one committed binding (Begin +
    /// Commit(value)) instead of enqueuing an outbox click — the atoms
    /// table's "button → list add/remove" path (`SHEET-3`). `None`
    /// keeps the outbox behaviour the toolbar drains.
    pub commit: Option<(Binding, BindingValue)>,
}

impl Widget for Button {
    fn id(&self) -> &WidgetId {
        &self.id
    }

    fn default_state(&self) -> WidgetState {
        WidgetState::Button(ButtonState::default())
    }

    fn build(&self, ctx: &mut BuildCtx, parent: Parent) -> NodeId {
        let nf = NodeFactory::new();
        let mut cell = nf.create_container_node();
        cell.layout_container = LayoutContainerStyle {
            layout_mode: LayoutMode::Flex,
            layout_direction: Axis::Vertical,
            layout_padding: Some(EdgeInsets {
                top: 4.0,
                right: 0.0,
                bottom: 4.0,
                left: 0.0,
            }),
            ..Default::default()
        };
        cell.layout_dimensions.layout_target_width = Some(self.width);
        cell.layout_dimensions.layout_target_height = Some(self.height);
        let (fill, text_color) = if self.active {
            (
                CGColor::from_rgba(50, 50, 50, 255),
                CGColor::from_rgba(255, 255, 255, 255),
            )
        } else {
            (
                CGColor::from_rgba(240, 240, 240, 255),
                CGColor::from_rgba(40, 40, 40, 255),
            )
        };
        cell.fills = Paints::new([Paint::Solid(SolidPaint::new_color(fill))]);
        cell.corner_radius = RectangularCornerRadius::circular(3.0);
        let node = ctx.graph.append_child(Node::Container(cell), parent);
        ctx.register(&self.id, node, true, true);

        let mut label = nf.create_text_span_node();
        label.text = self.label.clone();
        label.width = Some(self.width);
        label.height = Some(self.height - 8.0);
        label.text_style = TextStyleRec::from_font("Geist", 10.0);
        label.text_align = TextAlign::Center;
        label.fills = Paints::new([Paint::Solid(SolidPaint::new_color(text_color))]);
        ctx.graph
            .append_child(Node::TextSpan(label), Parent::NodeId(node));
        node
    }

    fn handle(
        &self,
        state: &mut WidgetState,
        event: &WidgetEvent,
        _bounds: Rectangle,
    ) -> UiResponse {
        match event {
            WidgetEvent::PointerDown { .. }
            | WidgetEvent::Key {
                key: KeyName::Enter | KeyName::Space,
                ..
            } => {
                if let Some((binding, value)) = &self.commit {
                    return UiResponse {
                        consumed: true,
                        emissions: vec![
                            Emission {
                                binding: binding.clone(),
                                phase: BindingPhase::Begin,
                            },
                            Emission {
                                binding: binding.clone(),
                                phase: BindingPhase::Commit(value.clone()),
                            },
                        ],
                        rebuild: true,
                        ..UiResponse::default()
                    };
                }
                if let WidgetState::Button(s) = state {
                    s.clicks += 1;
                }
                UiResponse::consumed()
            }
            _ => UiResponse::ignored(),
        }
    }
}
