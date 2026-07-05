//! `toggle` — the boolean atom (`widgets.md` "toggle"; the value
//! shape `boolean` in the inventory). One click (or Enter/Space when
//! focused) is one begin→commit gesture carrying the flipped value
//! (`UI-4`): visible, locked, wrap, clip-content, italic, and every
//! paint/effect active toggle ride this one widget.
//!
//! Two fixed looks (`ToggleLook`) — a **check** box and a **switch**
//! latch — are cosmetic only; both edit the same boolean and emit the
//! same [`BindingValue::Bool`]. The displayed state is a
//! [`Field<bool>`]: `Value(true)`/`Value(false)` render on/off,
//! `Mixed` renders the indeterminate mark and its first edit
//! broadcasts `true` to all targets (`WID-6`), `Empty` renders off.
//!
//! Stateless: the widget retains nothing (`WidgetState::None`); the
//! displayed value comes from the config and the flip target is
//! computed from it, so a rebuild is a pure function of the field.

use grida::cg::prelude::*;
use grida::node::factory::NodeFactory;
use grida::node::scene_graph::Parent;
use grida::node::schema::*;
use grida::text_edit::session::KeyName;
use math2::rect::Rectangle;

use crate::ui::bind::{Binding, BindingPhase, BindingValue, Emission};
use crate::ui::field::Field;
use crate::ui::widget::{BuildCtx, UiResponse, Widget, WidgetEvent, WidgetId, WidgetState};

/// The two fixed looks. Cosmetic — both edit a boolean.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ToggleLook {
    /// A square box: empty when off, a check mark when on, a dash
    /// when mixed (the checkbox idiom).
    Check,
    /// A pill with a knob that latches left (off) / right (on) (the
    /// switch idiom).
    Switch,
}

pub struct Toggle {
    pub id: WidgetId,
    /// Displayed state; the panel rebuilds on change.
    pub value: Field<bool>,
    pub look: ToggleLook,
    /// Square edge (check) / pill height (switch), logical px.
    pub size: f32,
    pub binding: Binding,
}

impl Toggle {
    /// The value one flip commits: the negation of a concrete value;
    /// `true` from mixed/empty (first edit turns the property on for
    /// every target).
    fn flipped(&self) -> bool {
        match self.value {
            Field::Value(v) => !v,
            Field::Mixed | Field::Empty => true,
        }
    }

    fn commit(&self) -> UiResponse {
        let next = self.flipped();
        UiResponse {
            consumed: true,
            emissions: vec![
                Emission {
                    binding: self.binding.clone(),
                    phase: BindingPhase::Begin,
                },
                Emission {
                    binding: self.binding.clone(),
                    phase: BindingPhase::Commit(BindingValue::Bool(next)),
                },
            ],
            capture: false,
            release: false,
            rebuild: false,
        }
    }

    fn build_check(&self, ctx: &mut BuildCtx, parent: Parent) -> NodeId {
        let nf = NodeFactory::new();
        let on = matches!(self.value, Field::Value(true));
        let mixed = self.value.is_mixed();
        let mut box_node = nf.create_container_node();
        box_node.layout_dimensions.layout_target_width = Some(self.size);
        box_node.layout_dimensions.layout_target_height = Some(self.size);
        let fill = if on || mixed {
            CGColor::from_rgba(50, 50, 50, 255)
        } else {
            CGColor::from_rgba(255, 255, 255, 255)
        };
        box_node.fills = Paints::new([Paint::Solid(SolidPaint::new_color(fill))]);
        box_node.strokes = Paints::new([Paint::Solid(SolidPaint::new_color(CGColor::from_rgba(
            180, 180, 180, 255,
        )))]);
        box_node.stroke_width = StrokeWidth::Uniform(1.0);
        box_node.corner_radius = RectangularCornerRadius::circular(3.0);
        let node = ctx.graph.append_child(Node::Container(box_node), parent);
        ctx.register(&self.id, node, true, true);

        // The mark: a check when on, a dash when mixed, nothing off.
        if on || mixed {
            let mut mark = nf.create_text_span_node();
            mark.text = if mixed {
                "–".to_string()
            } else {
                "✓".to_string()
            };
            mark.width = Some(self.size);
            mark.height = Some(self.size - 2.0);
            mark.text_style = TextStyleRec::from_font("Geist", self.size * 0.7);
            mark.text_align = TextAlign::Center;
            mark.fills = Paints::new([Paint::Solid(SolidPaint::new_color(CGColor::from_rgba(
                255, 255, 255, 255,
            )))]);
            ctx.graph
                .append_child(Node::TextSpan(mark), Parent::NodeId(node));
        }
        node
    }

    fn build_switch(&self, ctx: &mut BuildCtx, parent: Parent) -> NodeId {
        let nf = NodeFactory::new();
        let on = matches!(self.value, Field::Value(true));
        let mixed = self.value.is_mixed();
        let width = self.size * 1.8;
        let mut track = nf.create_container_node();
        track.layout_dimensions.layout_target_width = Some(width);
        track.layout_dimensions.layout_target_height = Some(self.size);
        let fill = if on {
            CGColor::from_rgba(50, 50, 50, 255)
        } else if mixed {
            CGColor::from_rgba(180, 180, 180, 255)
        } else {
            CGColor::from_rgba(220, 220, 220, 255)
        };
        track.fills = Paints::new([Paint::Solid(SolidPaint::new_color(fill))]);
        track.corner_radius = RectangularCornerRadius::circular(self.size * 0.5);
        track.clip = true;
        let node = ctx.graph.append_child(Node::Container(track), parent);
        ctx.register(&self.id, node, true, true);

        // The knob: latched right when on, left otherwise (mid on
        // mixed reads as the intermediate the fill already conveys).
        let inset = 2.0;
        let knob_d = self.size - inset * 2.0;
        let knob_x = if on { width - knob_d - inset } else { inset };
        let mut knob = nf.create_rectangle_node();
        knob.transform = math2::transform::AffineTransform::new(knob_x, inset, 0.0);
        knob.size = Size {
            width: knob_d,
            height: knob_d,
        };
        knob.fills = Paints::new([Paint::Solid(SolidPaint::new_color(CGColor::from_rgba(
            255, 255, 255, 255,
        )))]);
        knob.corner_radius = RectangularCornerRadius::circular(knob_d * 0.5);
        ctx.graph
            .append_child(Node::Rectangle(knob), Parent::NodeId(node));
        node
    }
}

impl Widget for Toggle {
    fn id(&self) -> &WidgetId {
        &self.id
    }

    fn build(&self, ctx: &mut BuildCtx, parent: Parent) -> NodeId {
        match self.look {
            ToggleLook::Check => self.build_check(ctx, parent),
            ToggleLook::Switch => self.build_switch(ctx, parent),
        }
    }

    fn handle(
        &self,
        _state: &mut WidgetState,
        event: &WidgetEvent,
        _bounds: Rectangle,
    ) -> UiResponse {
        match event {
            WidgetEvent::PointerDown { .. }
            | WidgetEvent::Key {
                key: KeyName::Enter | KeyName::Space,
                ..
            } => self.commit(),
            _ => UiResponse::ignored(),
        }
    }
}
