//! `number` — text-editable numeric input (`widgets.md` "numeric
//! input"; `WID-1`, `WID-2`).
//!
//! Three interactions:
//!
//! - **Scrub** — a horizontal pointer drag on the widget body emits
//!   delta-driven previews and exactly one commit on release (the
//!   slider's `UI-4` bind pattern). The gesture opens lazily on the
//!   first *move* past nothing (a plain click focuses without
//!   committing), so click-to-focus leaves history untouched.
//! - **Step keys** — one arrow press is one begin→commit gesture
//!   carrying a relative [`BindingValue::NumberDelta`] of ±step: on a
//!   mixed selection each target moves by the delta from its *own*
//!   value (`WID-2`).
//! - **Typed entry** — while focused, digit/dot/minus keys accumulate
//!   into an edit buffer displayed in place of the value; Enter
//!   commits one absolute `set` (`WID-1`), Escape discards the buffer
//!   (no commit, prior value intact). The buffer is retained state
//!   (`UI-2`), so panels can rebuild the widget to render it.
//!
//! M-scope gaps, stated honestly: no units, no empty/`auto` state
//! (the spec's distinct-from-zero blank), no mixed-state rendering
//! (`WID-6` — see `PROP-2` note in [`crate::ui::properties`]).

use grida::cg::prelude::*;
use grida::node::factory::NodeFactory;
use grida::node::scene_graph::Parent;
use grida::node::schema::*;
use grida::text_edit::session::KeyName;
use math2::rect::Rectangle;

use crate::ui::bind::{Binding, BindingPhase, BindingValue, Emission};
use crate::ui::widget::{BuildCtx, UiResponse, Widget, WidgetEvent, WidgetId, WidgetState};

/// Scrub movement (px) before the gesture opens — a plain click
/// focuses without opening a gesture.
pub const SCRUB_THRESHOLD: f32 = 3.0;

/// Retained numeric-input state.
#[derive(Debug, Clone, PartialEq)]
pub struct NumberState {
    /// Open scrub, if any.
    pub drag: Option<NumberDrag>,
    /// Typed-entry buffer (`Some` while editing, shown in place).
    pub buffer: Option<String>,
}

/// An open scrub: the pointer/value anchors and whether the gesture
/// frame has been opened (lazily, past the movement threshold).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct NumberDrag {
    pub start_value: f32,
    pub start_x: f32,
    pub last_value: f32,
    /// `Begin` has been emitted (first move past the threshold).
    pub begun: bool,
}

pub struct Number {
    pub id: WidgetId,
    /// Displayed value (the bound node's current value; the panel
    /// rebuilds on change).
    pub value: f32,
    pub min: Option<f32>,
    pub max: Option<f32>,
    /// Arrow-key step (committed as a per-press relative delta).
    pub step: f32,
    /// Value change per horizontal scrub px.
    pub scrub_scale: f32,
    pub width: f32,
    pub height: f32,
    pub binding: Binding,
}

impl Number {
    fn clamp(&self, v: f32) -> f32 {
        let v = match self.min {
            Some(min) => v.max(min),
            None => v,
        };
        match self.max {
            Some(max) => v.min(max),
            None => v,
        }
    }

    fn emit(&self, phase: BindingPhase) -> Emission {
        Emission {
            binding: self.binding.clone(),
            phase,
        }
    }

    /// One arrow press = one begin→commit gesture with a relative
    /// delta (`WID-2`): one history entry, per-node relative change.
    fn step_commit(&self, delta: f32) -> UiResponse {
        UiResponse {
            consumed: true,
            emissions: vec![
                self.emit(BindingPhase::Begin),
                self.emit(BindingPhase::Commit(BindingValue::NumberDelta(delta))),
            ],
            capture: false,
            release: false,
            rebuild: false,
        }
    }
}

/// Format a value for display: fixed 2 decimals with trailing zeros
/// (and a dangling dot) trimmed.
pub fn format_value(v: f32) -> String {
    let s = format!("{v:.2}");
    let s = s.trim_end_matches('0').trim_end_matches('.');
    if s.is_empty() || s == "-" {
        "0".to_string()
    } else {
        s.to_string()
    }
}

impl Widget for Number {
    fn id(&self) -> &WidgetId {
        &self.id
    }

    fn default_state(&self) -> WidgetState {
        WidgetState::Number(NumberState {
            drag: None,
            buffer: None,
        })
    }

    fn build(&self, ctx: &mut BuildCtx, parent: Parent) -> NodeId {
        let buffer = match ctx.states.get(&self.id) {
            Some(WidgetState::Number(s)) => s.buffer.clone(),
            _ => None,
        };
        let nf = NodeFactory::new();

        // Body: a non-flex container so the text child positions by
        // schema coordinates.
        let mut body = nf.create_container_node();
        body.layout_dimensions.layout_target_width = Some(self.width);
        body.layout_dimensions.layout_target_height = Some(self.height);
        body.fills = Paints::new([Paint::Solid(SolidPaint::new_color(CGColor::from_rgba(
            255, 255, 255, 255,
        )))]);
        body.strokes = Paints::new([Paint::Solid(SolidPaint::new_color(CGColor::from_rgba(
            210, 210, 210, 255,
        )))]);
        body.stroke_width = StrokeWidth::Uniform(1.0);
        body.corner_radius = RectangularCornerRadius::circular(3.0);
        body.clip = true;
        let node = ctx.graph.append_child(Node::Container(body), parent);
        ctx.register(&self.id, node, true, true);

        // The displayed text: the edit buffer while typing (shown in
        // place, WID-1), the bound value otherwise.
        let editing = buffer.is_some();
        let text_value = match buffer {
            Some(b) if b.is_empty() => "_".to_string(),
            Some(b) => b,
            None => format_value(self.value),
        };
        let mut text = nf.create_text_span_node();
        text.text = text_value;
        text.transform = math2::transform::AffineTransform::new(5.0, 3.0, 0.0);
        text.width = Some(self.width - 10.0);
        text.height = Some(self.height - 6.0);
        text.text_style = TextStyleRec::from_font("Geist", 11.0);
        text.fills = Paints::new([Paint::Solid(SolidPaint::new_color(if editing {
            CGColor::from_rgba(20, 90, 200, 255)
        } else {
            CGColor::from_rgba(40, 40, 40, 255)
        }))]);
        ctx.graph
            .append_child(Node::TextSpan(text), Parent::NodeId(node));

        node
    }

    fn handle(
        &self,
        state: &mut WidgetState,
        event: &WidgetEvent,
        _bounds: Rectangle,
    ) -> UiResponse {
        let WidgetState::Number(s) = state else {
            return UiResponse::ignored();
        };
        match event {
            WidgetEvent::PointerDown { point, .. } => {
                // A press cancels any typed entry and arms a scrub; the
                // gesture opens on the first move past the threshold,
                // so click-to-focus commits nothing.
                s.buffer = None;
                s.drag = Some(NumberDrag {
                    start_value: self.value,
                    start_x: point[0],
                    last_value: self.value,
                    begun: false,
                });
                UiResponse {
                    consumed: true,
                    emissions: Vec::new(),
                    capture: true,
                    release: false,
                    rebuild: false,
                }
            }
            WidgetEvent::PointerMove { point } => {
                let Some(drag) = &mut s.drag else {
                    return UiResponse::ignored();
                };
                let dx = point[0] - drag.start_x;
                if !drag.begun && dx.abs() < SCRUB_THRESHOLD {
                    return UiResponse::consumed();
                }
                let mut emissions = Vec::new();
                if !drag.begun {
                    drag.begun = true;
                    emissions.push(self.emit(BindingPhase::Begin));
                }
                let value = self.clamp(drag.start_value + dx * self.scrub_scale);
                drag.last_value = value;
                emissions.push(self.emit(BindingPhase::Preview(BindingValue::Number(value))));
                UiResponse {
                    consumed: true,
                    emissions,
                    capture: false,
                    release: false,
                    rebuild: false,
                }
            }
            WidgetEvent::PointerUp { .. } => {
                let Some(drag) = s.drag.take() else {
                    return UiResponse::ignored();
                };
                let emissions = if drag.begun {
                    vec![self.emit(BindingPhase::Commit(BindingValue::Number(drag.last_value)))]
                } else {
                    Vec::new() // Plain click: focus only, no commit.
                };
                UiResponse {
                    consumed: true,
                    emissions,
                    capture: false,
                    release: true,
                    rebuild: false,
                }
            }
            WidgetEvent::Key { key, .. } => match key {
                KeyName::ArrowUp | KeyName::ArrowRight => self.step_commit(self.step),
                KeyName::ArrowDown | KeyName::ArrowLeft => self.step_commit(-self.step),
                KeyName::Character(c)
                    if c.chars()
                        .all(|ch| ch.is_ascii_digit() || ch == '.' || ch == '-') =>
                {
                    s.buffer.get_or_insert_with(String::new).push_str(c);
                    UiResponse::consumed()
                }
                KeyName::Backspace => {
                    let Some(buffer) = &mut s.buffer else {
                        return UiResponse::ignored();
                    };
                    buffer.pop();
                    UiResponse::consumed()
                }
                KeyName::Enter => {
                    let Some(buffer) = s.buffer.take() else {
                        return UiResponse::ignored();
                    };
                    let Ok(v) = buffer.parse::<f32>() else {
                        // Unparseable entry: discard, commit nothing.
                        return UiResponse::consumed();
                    };
                    let v = self.clamp(v);
                    UiResponse {
                        consumed: true,
                        emissions: vec![
                            self.emit(BindingPhase::Begin),
                            self.emit(BindingPhase::Commit(BindingValue::Number(v))),
                        ],
                        capture: false,
                        release: false,
                        rebuild: false,
                    }
                }
                KeyName::Escape => {
                    // Cancel typed entry: prior value intact, no commit
                    // (WID-1). During a begun scrub: revert.
                    if s.buffer.take().is_some() {
                        return UiResponse::consumed();
                    }
                    if let Some(drag) = s.drag.take() {
                        if drag.begun {
                            return UiResponse {
                                consumed: true,
                                emissions: vec![self.emit(BindingPhase::Revert)],
                                capture: false,
                                release: true,
                                rebuild: false,
                            };
                        }
                        return UiResponse {
                            consumed: true,
                            emissions: Vec::new(),
                            capture: false,
                            release: true,
                            rebuild: false,
                        };
                    }
                    UiResponse::ignored()
                }
                _ => UiResponse::ignored(),
            },
        }
    }
}
