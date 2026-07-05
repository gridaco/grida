//! `quad` — the four-sided composite (`widgets-inventory.md`): corner
//! radius, padding, and per-side stroke width. One compound value in
//! `[top, right, bottom, left]` order, edited in one of two modes — a
//! single **uniform** field writing all four, or four **split**
//! fields writing one side each — toggled by the mode button. The
//! mode is widget state, never document state (`WID-9`); every commit
//! is one [`BindingValue::Quad`], one history entry.
//!
//! Monolithic by necessity: a composite that folds several sub-fields
//! into one compound commit cannot be a container of atoms (child
//! emissions do not bubble to a parent widget — the layer routes each
//! hit to the widget that owns it). So the quad draws its sub-fields
//! and hit-tests them itself, exactly as the segmented/select atoms
//! do with their cells.
//!
//! Editing is typed entry + arrow-step, the numeric-input discipline
//! (`WID-1`/`WID-2`) applied per sub-field; scrub is a later add.

use grida::cg::prelude::*;
use grida::node::factory::NodeFactory;
use grida::node::scene_graph::Parent;
use grida::node::schema::*;
use grida::text_edit::session::KeyName;
use math2::rect::Rectangle;

use crate::ui::bind::{Binding, BindingPhase, BindingValue, Emission};
use crate::ui::field::Field;
use crate::ui::widget::{BuildCtx, UiResponse, Widget, WidgetEvent, WidgetId, WidgetState};
use crate::ui::widgets::number::format_value;

/// Width of the mode-toggle button, logical px.
const MODE_W: f32 = 20.0;

/// Retained quad state (`UI-2`).
#[derive(Debug, Clone, Default, PartialEq)]
pub struct QuadState {
    /// Four independent side fields (else one uniform field).
    pub split: bool,
    /// The focused sub-field: `0` in uniform mode, `0..4` in split
    /// mode (`top, right, bottom, left`).
    pub active: Option<usize>,
    /// Typed-entry buffer for the active field.
    pub buffer: Option<String>,
}

pub struct Quad {
    pub id: WidgetId,
    /// The four sides `[top, right, bottom, left]`; the panel rebuilds
    /// on change.
    pub value: Field<[f32; 4]>,
    pub min: Option<f32>,
    pub width: f32,
    pub height: f32,
    pub binding: Binding,
}

impl Quad {
    fn sides(&self) -> [f32; 4] {
        self.value.value().unwrap_or([0.0; 4])
    }

    /// The uniform display value: the common side value when all four
    /// agree (and the field is concrete), else `None` (renders blank).
    fn uniform(&self) -> Option<f32> {
        let s = self.value.value()?;
        (s[0] == s[1] && s[1] == s[2] && s[2] == s[3]).then_some(s[0])
    }

    fn clamp(&self, v: f32) -> f32 {
        match self.min {
            Some(min) => v.max(min),
            None => v,
        }
    }

    fn field_count(&self, split: bool) -> usize {
        if split { 4 } else { 1 }
    }

    fn field_width(&self, split: bool) -> f32 {
        (self.width - MODE_W) / self.field_count(split) as f32
    }

    /// Which region a point lands in: `None` = outside; `Some(None)` =
    /// the mode button; `Some(Some(i))` = field `i`.
    fn hit(&self, point: [f32; 2], bounds: Rectangle, split: bool) -> Option<Option<usize>> {
        if !bounds.contains_point(point) {
            return None;
        }
        let rel = point[0] - bounds.x;
        if rel < MODE_W {
            return Some(None);
        }
        let fw = self.field_width(split);
        let i = (((rel - MODE_W) / fw) as usize).min(self.field_count(split) - 1);
        Some(Some(i))
    }

    fn emit(&self, phase: BindingPhase) -> Emission {
        Emission {
            binding: self.binding.clone(),
            phase,
        }
    }

    /// Commit a new four-side value derived from `v` written into the
    /// active side (uniform → all four).
    fn commit_side(&self, active: usize, split: bool, v: f32) -> UiResponse {
        let v = self.clamp(v);
        let next = if split {
            let mut s = self.sides();
            s[active] = v;
            s
        } else {
            [v; 4]
        };
        UiResponse {
            consumed: true,
            emissions: vec![
                self.emit(BindingPhase::Begin),
                self.emit(BindingPhase::Commit(BindingValue::Quad(next))),
            ],
            rebuild: true,
            ..UiResponse::default()
        }
    }

    fn build_field(
        &self,
        ctx: &mut BuildCtx,
        nf: &NodeFactory,
        parent: NodeId,
        text: String,
        fw: f32,
        editing: bool,
    ) {
        let mut cell = nf.create_container_node();
        cell.layout_dimensions.layout_target_width = Some(fw);
        cell.layout_dimensions.layout_target_height = Some(self.height);
        cell.strokes = Paints::new([Paint::Solid(SolidPaint::new_color(CGColor::from_rgba(
            225, 225, 225, 255,
        )))]);
        cell.stroke_width = StrokeWidth::Uniform(1.0);
        let cnode = ctx
            .graph
            .append_child(Node::Container(cell), Parent::NodeId(parent));

        let mut span = nf.create_text_span_node();
        span.text = text;
        span.transform = math2::transform::AffineTransform::new(4.0, 3.0, 0.0);
        span.width = Some(fw - 6.0);
        span.height = Some(self.height - 6.0);
        span.text_style = TextStyleRec::from_font("Geist", 11.0);
        span.fills = Paints::new([Paint::Solid(SolidPaint::new_color(if editing {
            CGColor::from_rgba(20, 90, 200, 255)
        } else {
            CGColor::from_rgba(40, 40, 40, 255)
        }))]);
        ctx.graph
            .append_child(Node::TextSpan(span), Parent::NodeId(cnode));
    }
}

impl Widget for Quad {
    fn id(&self) -> &WidgetId {
        &self.id
    }

    fn default_state(&self) -> WidgetState {
        WidgetState::Quad(QuadState::default())
    }

    fn build(&self, ctx: &mut BuildCtx, parent: Parent) -> NodeId {
        let state = match ctx.states.get(&self.id) {
            Some(WidgetState::Quad(s)) => s.clone(),
            _ => QuadState::default(),
        };
        let nf = NodeFactory::new();

        let mut body = nf.create_container_node();
        body.layout_container = LayoutContainerStyle {
            layout_mode: LayoutMode::Flex,
            layout_direction: Axis::Horizontal,
            layout_gap: Some(LayoutGap::uniform(0.0)),
            ..Default::default()
        };
        body.layout_dimensions.layout_target_width = Some(self.width);
        body.layout_dimensions.layout_target_height = Some(self.height);
        body.corner_radius = RectangularCornerRadius::circular(3.0);
        body.clip = true;
        let node = ctx.graph.append_child(Node::Container(body), parent);
        ctx.register(&self.id, node, true, true);

        // Mode button: the split glyph reads "four sides", the uniform
        // glyph "one".
        let mut mode = nf.create_container_node();
        mode.layout_container = LayoutContainerStyle {
            layout_mode: LayoutMode::Flex,
            layout_main_axis_alignment: Some(MainAxisAlignment::Center),
            layout_cross_axis_alignment: Some(CrossAxisAlignment::Center),
            ..Default::default()
        };
        mode.layout_dimensions.layout_target_width = Some(MODE_W);
        mode.layout_dimensions.layout_target_height = Some(self.height);
        mode.fills = Paints::new([Paint::Solid(SolidPaint::new_color(CGColor::from_rgba(
            240, 240, 240, 255,
        )))]);
        let mnode = ctx
            .graph
            .append_child(Node::Container(mode), Parent::NodeId(node));
        let mut mglyph = nf.create_text_span_node();
        mglyph.text = if state.split {
            "⊞".to_string()
        } else {
            "▢".to_string()
        };
        mglyph.width = Some(MODE_W);
        mglyph.height = Some(self.height - 6.0);
        mglyph.text_style = TextStyleRec::from_font("Geist", 11.0);
        mglyph.text_align = TextAlign::Center;
        mglyph.fills = Paints::new([Paint::Solid(SolidPaint::new_color(CGColor::from_rgba(
            90, 90, 90, 255,
        )))]);
        ctx.graph
            .append_child(Node::TextSpan(mglyph), Parent::NodeId(mnode));

        let fw = self.field_width(state.split);
        let field_text = |i: usize| -> String {
            if state.active == Some(i)
                && let Some(b) = &state.buffer
            {
                return if b.is_empty() {
                    "_".to_string()
                } else {
                    b.clone()
                };
            }
            if state.split {
                format_value(self.sides()[i])
            } else {
                match self.uniform() {
                    Some(v) => format_value(v),
                    None => "Mixed".to_string(),
                }
            }
        };
        for i in 0..self.field_count(state.split) {
            self.build_field(
                ctx,
                &nf,
                node,
                field_text(i),
                fw,
                state.active == Some(i) && state.buffer.is_some(),
            );
        }
        node
    }

    fn handle(
        &self,
        state: &mut WidgetState,
        event: &WidgetEvent,
        bounds: Rectangle,
    ) -> UiResponse {
        let WidgetState::Quad(s) = state else {
            return UiResponse::ignored();
        };
        match event {
            WidgetEvent::PointerDown { point, .. } => match self.hit(*point, bounds, s.split) {
                Some(None) => {
                    // Mode toggle: flip uniform⇄split (widget state).
                    s.split = !s.split;
                    s.active = None;
                    s.buffer = None;
                    UiResponse {
                        consumed: true,
                        rebuild: true,
                        ..UiResponse::default()
                    }
                }
                Some(Some(i)) => {
                    // Focus a field for typed entry.
                    s.active = Some(i);
                    s.buffer = Some(String::new());
                    UiResponse {
                        consumed: true,
                        rebuild: true,
                        ..UiResponse::default()
                    }
                }
                None => UiResponse::consumed(),
            },
            WidgetEvent::Key { key, .. } => {
                let split = s.split;
                match key {
                    KeyName::Character(c)
                        if c.chars()
                            .all(|ch| ch.is_ascii_digit() || ch == '.' || ch == '-') =>
                    {
                        if s.active.is_some() {
                            s.buffer.get_or_insert_with(String::new).push_str(c);
                            return UiResponse {
                                consumed: true,
                                rebuild: true,
                                ..UiResponse::default()
                            };
                        }
                        UiResponse::ignored()
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
                        let (Some(active), Some(buffer)) = (s.active, s.buffer.take()) else {
                            return UiResponse::ignored();
                        };
                        let Ok(v) = buffer.parse::<f32>() else {
                            return UiResponse {
                                consumed: true,
                                rebuild: true,
                                ..UiResponse::default()
                            };
                        };
                        s.active = None;
                        self.commit_side(active, split, v)
                    }
                    KeyName::ArrowUp | KeyName::ArrowDown => {
                        let Some(active) = s.active else {
                            return UiResponse::ignored();
                        };
                        let cur = if split {
                            self.sides()[active]
                        } else {
                            self.uniform().unwrap_or(0.0)
                        };
                        let delta = if matches!(key, KeyName::ArrowUp) {
                            1.0
                        } else {
                            -1.0
                        };
                        self.commit_side(active, split, cur + delta)
                    }
                    KeyName::Escape => {
                        if s.buffer.take().is_some() || s.active.take().is_some() {
                            return UiResponse {
                                consumed: true,
                                rebuild: true,
                                ..UiResponse::default()
                            };
                        }
                        UiResponse::ignored()
                    }
                    _ => UiResponse::ignored(),
                }
            }
            _ => UiResponse::ignored(),
        }
    }
}
