//! `text` — the single-line string atom (`widgets.md` "text input";
//! the value shape `string`). Name, href, hex entry, and user-data
//! ride this one widget. Clicking focuses and begins an edit; typing
//! accumulates into a buffer shown in place of the value; Enter
//! commits one [`BindingValue::Text`], Escape discards it (prior
//! value intact) — the commit/abort discipline of `UI-4`, the same
//! typed-entry model the numeric input uses, generalized to strings.
//!
//! The displayed value is a [`Field<String>`]: `Value` shows the
//! string, `Mixed` and `Empty` show distinct placeholders and, on
//! first keystroke, the buffer starts empty so the entered value
//! broadcasts to all targets (`WID-6`).
//!
//! IME (`WID-5`): the committed-string path is here; the *preedit*
//! round-trip (composition text visible mid-compose, only the
//! committed string reaching the patch) needs the engine's
//! text-editing session's composition events threaded through the
//! layer's key vocabulary — deferred and named, not silently omitted.
//! Caret movement / selection are likewise a later pass; the buffer
//! edits at its end (append / backspace), sufficient for the panel's
//! short fields.

use grida::cg::prelude::*;
use grida::node::factory::NodeFactory;
use grida::node::scene_graph::Parent;
use grida::node::schema::*;
use grida::text_edit::session::KeyName;
use math2::rect::Rectangle;

use crate::ui::bind::{Binding, BindingPhase, BindingValue, Emission};
use crate::ui::field::Field;
use crate::ui::widget::{BuildCtx, UiResponse, Widget, WidgetEvent, WidgetId, WidgetState};

/// Retained text-input state: the edit buffer while focused (`Some`
/// during an edit, shown in place of the value).
#[derive(Debug, Clone, Default, PartialEq)]
pub struct TextState {
    pub buffer: Option<String>,
}

pub struct Text {
    pub id: WidgetId,
    /// Displayed value; the panel rebuilds on change.
    pub value: Field<String>,
    /// Placeholder shown when empty / unfocused with no value.
    pub placeholder: String,
    pub width: f32,
    pub height: f32,
    pub binding: Binding,
}

impl Text {
    fn display_value(&self) -> String {
        match &self.value {
            Field::Value(s) => s.clone(),
            Field::Mixed => String::new(),
            Field::Empty => String::new(),
        }
    }

    /// The buffer an edit starts from: the concrete value, or empty
    /// for mixed / empty (first keystroke broadcasts, `WID-6`).
    fn edit_seed(&self) -> String {
        self.value.get().cloned().unwrap_or_default()
    }

    fn emit(&self, phase: BindingPhase) -> Emission {
        Emission {
            binding: self.binding.clone(),
            phase,
        }
    }

    fn placeholder_text(&self) -> String {
        match &self.value {
            Field::Mixed => "Mixed".to_string(),
            _ => self.placeholder.clone(),
        }
    }
}

impl Widget for Text {
    fn id(&self) -> &WidgetId {
        &self.id
    }

    fn default_state(&self) -> WidgetState {
        WidgetState::Text(TextState::default())
    }

    fn build(&self, ctx: &mut BuildCtx, parent: Parent) -> NodeId {
        let buffer = match ctx.states.get(&self.id) {
            Some(WidgetState::Text(s)) => s.buffer.clone(),
            _ => None,
        };
        let editing = buffer.is_some();
        let nf = NodeFactory::new();

        let mut body = nf.create_container_node();
        body.layout_dimensions.layout_target_width = Some(self.width);
        body.layout_dimensions.layout_target_height = Some(self.height);
        body.fills = Paints::new([Paint::Solid(SolidPaint::new_color(CGColor::from_rgba(
            255, 255, 255, 255,
        )))]);
        body.strokes = Paints::new([Paint::Solid(SolidPaint::new_color(if editing {
            CGColor::from_rgba(20, 90, 200, 255)
        } else {
            CGColor::from_rgba(210, 210, 210, 255)
        }))]);
        body.stroke_width = StrokeWidth::Uniform(1.0);
        body.corner_radius = RectangularCornerRadius::circular(3.0);
        body.clip = true;
        let node = ctx.graph.append_child(Node::Container(body), parent);
        ctx.register(&self.id, node, true, true);

        // The displayed text: the buffer (with a caret) while editing,
        // the value otherwise, or the placeholder when blank.
        let value_text = self.display_value();
        let is_placeholder = !editing && value_text.is_empty();
        let shown = match &buffer {
            Some(b) => format!("{b}|"),
            None if value_text.is_empty() => self.placeholder_text(),
            None => value_text,
        };
        let color = if is_placeholder && buffer.is_none() {
            CGColor::from_rgba(160, 160, 160, 255)
        } else {
            CGColor::from_rgba(40, 40, 40, 255)
        };
        let mut text = nf.create_text_span_node();
        text.text = shown;
        text.transform = math2::transform::AffineTransform::new(6.0, 3.0, 0.0);
        text.width = Some(self.width - 12.0);
        text.height = Some(self.height - 6.0);
        text.text_style = TextStyleRec::from_font("Geist", 11.0);
        text.fills = Paints::new([Paint::Solid(SolidPaint::new_color(color))]);
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
        let WidgetState::Text(s) = state else {
            return UiResponse::ignored();
        };
        match event {
            WidgetEvent::PointerDown { .. } => {
                // Focus begins an edit seeded from the current value.
                if s.buffer.is_none() {
                    s.buffer = Some(self.edit_seed());
                }
                UiResponse {
                    consumed: true,
                    rebuild: true,
                    ..UiResponse::default()
                }
            }
            WidgetEvent::Key { key, .. } => match key {
                KeyName::Character(c) => {
                    s.buffer.get_or_insert_with(|| self.edit_seed()).push_str(c);
                    UiResponse {
                        consumed: true,
                        rebuild: true,
                        ..UiResponse::default()
                    }
                }
                KeyName::Space => {
                    s.buffer.get_or_insert_with(|| self.edit_seed()).push(' ');
                    UiResponse {
                        consumed: true,
                        rebuild: true,
                        ..UiResponse::default()
                    }
                }
                KeyName::Backspace => {
                    let Some(buffer) = &mut s.buffer else {
                        return UiResponse::ignored();
                    };
                    buffer.pop();
                    UiResponse {
                        consumed: true,
                        rebuild: true,
                        ..UiResponse::default()
                    }
                }
                KeyName::Enter => {
                    let Some(buffer) = s.buffer.take() else {
                        return UiResponse::ignored();
                    };
                    UiResponse {
                        consumed: true,
                        emissions: vec![
                            self.emit(BindingPhase::Begin),
                            self.emit(BindingPhase::Commit(BindingValue::Text(buffer))),
                        ],
                        rebuild: true,
                        ..UiResponse::default()
                    }
                }
                KeyName::Escape => {
                    // Discard the edit: prior value intact, no commit.
                    if s.buffer.take().is_some() {
                        return UiResponse {
                            consumed: true,
                            rebuild: true,
                            ..UiResponse::default()
                        };
                    }
                    UiResponse::ignored()
                }
                _ => UiResponse::ignored(),
            },
            _ => UiResponse::ignored(),
        }
    }
}
