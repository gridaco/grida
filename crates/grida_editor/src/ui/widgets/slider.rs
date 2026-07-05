//! `slider` — bounded scalar drag: previews during drag, exactly one
//! commit on release (`UI-4`, `WID-3`); arrow keys commit a step per
//! press; Escape during a drag reverts.
//!
//! Visuals are a track container with a fill rectangle sized by the
//! value fraction — plain schema nodes (`UI-1`). The displayed value
//! comes from the config (the panel rebuilds the slider when the
//! document value changes); the drag anchor lives in retained state so
//! it survives mid-drag rebuilds (`UI-2`).

use grida::cg::prelude::*;
use grida::node::factory::NodeFactory;
use grida::node::scene_graph::Parent;
use grida::node::schema::*;
use grida::text_edit::session::KeyName;
use math2::rect::Rectangle;

use crate::ui::bind::{Binding, BindingPhase, BindingValue, Emission};
use crate::ui::widget::{BuildCtx, UiResponse, Widget, WidgetEvent, WidgetId, WidgetState};

/// Retained slider state: the open drag, if any.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct SliderState {
    pub drag: Option<SliderDrag>,
}

/// An open drag: the pre-drag value (revert target) and the last
/// previewed value (the commit value, `WID-3`: commit == last preview).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct SliderDrag {
    pub start_value: f32,
    pub last_value: f32,
}

pub struct Slider {
    pub id: WidgetId,
    pub value: f32,
    pub min: f32,
    pub max: f32,
    /// Arrow-key step (committed per press).
    pub step: f32,
    pub width: f32,
    pub height: f32,
    pub binding: Binding,
}

impl Slider {
    fn fraction(&self, value: f32) -> f32 {
        if self.max <= self.min {
            return 0.0;
        }
        ((value - self.min) / (self.max - self.min)).clamp(0.0, 1.0)
    }

    /// Map a pointer x (world/logical px) to a value via the widget's
    /// engine-computed bounds.
    fn value_at(&self, x: f32, bounds: Rectangle) -> f32 {
        if bounds.width <= 0.0 {
            return self.min;
        }
        let t = ((x - bounds.x) / bounds.width).clamp(0.0, 1.0);
        self.min + t * (self.max - self.min)
    }

    fn emit(&self, phase: BindingPhase) -> Emission {
        Emission {
            binding: self.binding.clone(),
            phase,
        }
    }
}

impl Widget for Slider {
    fn id(&self) -> &WidgetId {
        &self.id
    }

    fn default_state(&self) -> WidgetState {
        WidgetState::Slider(SliderState { drag: None })
    }

    fn build(&self, ctx: &mut BuildCtx, parent: Parent) -> NodeId {
        let nf = NodeFactory::new();

        // Track: non-flex container so the fill child positions by
        // schema coordinates.
        let mut track = nf.create_container_node();
        track.layout_dimensions.layout_target_width = Some(self.width);
        track.layout_dimensions.layout_target_height = Some(self.height);
        track.fills = Paints::new([Paint::Solid(SolidPaint::new_color(CGColor::from_rgba(
            225, 225, 225, 255,
        )))]);
        track.corner_radius = RectangularCornerRadius::circular(3.0);
        track.clip = true;
        let node = ctx.graph.append_child(Node::Container(track), parent);
        ctx.register(&self.id, node, true, true);

        let mut fill = nf.create_rectangle_node();
        fill.size = Size {
            width: self.fraction(self.value) * self.width,
            height: self.height,
        };
        fill.fills = Paints::new([Paint::Solid(SolidPaint::new_color(CGColor::from_rgba(
            110, 110, 110, 255,
        )))]);
        ctx.graph
            .append_child(Node::Rectangle(fill), Parent::NodeId(node));

        node
    }

    fn handle(
        &self,
        state: &mut WidgetState,
        event: &WidgetEvent,
        bounds: Rectangle,
    ) -> UiResponse {
        let WidgetState::Slider(s) = state else {
            return UiResponse::ignored();
        };
        match event {
            WidgetEvent::PointerDown { .. } => {
                s.drag = Some(SliderDrag {
                    start_value: self.value,
                    last_value: self.value,
                });
                UiResponse {
                    consumed: true,
                    emissions: vec![self.emit(BindingPhase::Begin)],
                    capture: true,
                    release: false,
                    rebuild: false,
                }
            }
            WidgetEvent::PointerMove { point } => {
                let Some(drag) = &mut s.drag else {
                    return UiResponse::ignored();
                };
                let value = self.value_at(point[0], bounds);
                drag.last_value = value;
                UiResponse {
                    consumed: true,
                    emissions: vec![self.emit(BindingPhase::Preview(BindingValue::Number(value)))],
                    capture: false,
                    release: false,
                    rebuild: false,
                }
            }
            WidgetEvent::PointerUp { .. } => {
                let Some(drag) = s.drag.take() else {
                    return UiResponse::ignored();
                };
                UiResponse {
                    consumed: true,
                    emissions: vec![
                        self.emit(BindingPhase::Commit(BindingValue::Number(drag.last_value))),
                    ],
                    capture: false,
                    release: true,
                    rebuild: false,
                }
            }
            WidgetEvent::Key { key, .. } => match key {
                KeyName::ArrowLeft | KeyName::ArrowDown => self.step_commit(-self.step),
                KeyName::ArrowRight | KeyName::ArrowUp => self.step_commit(self.step),
                KeyName::Escape => {
                    if s.drag.take().is_some() {
                        UiResponse {
                            consumed: true,
                            emissions: vec![self.emit(BindingPhase::Revert)],
                            capture: false,
                            release: true,
                            rebuild: false,
                        }
                    } else {
                        UiResponse::ignored()
                    }
                }
                _ => UiResponse::ignored(),
            },
        }
    }
}

impl Slider {
    /// One arrow press = one full interaction (begin → preview →
    /// commit): one history entry per press (`WID` slider contract).
    fn step_commit(&self, delta: f32) -> UiResponse {
        let value = (self.value + delta).clamp(self.min, self.max);
        UiResponse {
            consumed: true,
            emissions: vec![
                self.emit(BindingPhase::Begin),
                self.emit(BindingPhase::Preview(BindingValue::Number(value))),
                self.emit(BindingPhase::Commit(BindingValue::Number(value))),
            ],
            capture: false,
            release: false,
            rebuild: false,
        }
    }
}
