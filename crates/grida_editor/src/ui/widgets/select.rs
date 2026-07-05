//! `select` — the "one-of-N, options collapsed" atom (`widgets.md`
//! "select"). A closed button shows the current option; activating it
//! opens a floating list on the shared [popover](crate::ui::popover)
//! primitive; choosing a row commits [`BindingValue::Index`], and an
//! outside press or Escape dismisses without a commit (`WID-8`).
//!
//! This is the first **self-contained** floating overlay: unlike the
//! context menu (a host on its own layer), a select lives inline in a
//! panel. It manages its own open list and modality with what the
//! layer already gives every widget — it takes the earned pointer
//! capture ([`UiResponse::capture`]) on open (the popup grab) and
//! asks the layer to rebuild its subtree ([`UiResponse::rebuild`])
//! when the list opens, highlights, or closes. The list is built as
//! its own top-level scene root at the button's anchor (an overlay
//! must be a root, never a second absolute child — the engine lays
//! out only the first).
//!
//! Placement is downward from the button; the flip/clamp of
//! [`crate::ui::popover::place`] needs the viewport, which a
//! host-less inline widget does not see at build time — near-viewport-
//! bottom flipping is deferred to the menu (which has a host). Panel
//! selects sit well inside the strip, so downward suffices.

use grida::cg::prelude::*;
use grida::node::factory::NodeFactory;
use grida::node::scene_graph::Parent;
use grida::node::schema::*;
use grida::text_edit::session::KeyName;
use math2::rect::Rectangle;

use crate::ui::bind::{Binding, BindingPhase, BindingValue, Emission};
use crate::ui::field::Field;
use crate::ui::popover;
use crate::ui::widget::{BuildCtx, UiResponse, Widget, WidgetEvent, WidgetId, WidgetState};

/// List row height, logical px.
pub const ROW_H: f32 = 22.0;
/// List panel padding.
pub const PAD: f32 = 4.0;

/// Retained select state (`UI-2`).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct SelectState {
    /// The list is open.
    pub open: bool,
    /// The open list's top-left origin (the button's bottom-left,
    /// captured from the button's world bounds when it opens).
    pub anchor: [f32; 2],
    /// Hovered / keyboard-highlighted row.
    pub highlight: Option<usize>,
    /// The opening press has not yet released — its release over the
    /// button keeps the list open (click-to-open), rather than
    /// toggling it shut.
    pub just_opened: bool,
}

impl Default for SelectState {
    fn default() -> Self {
        Self {
            open: false,
            anchor: [0.0, 0.0],
            highlight: None,
            just_opened: false,
        }
    }
}

pub struct Select {
    pub id: WidgetId,
    pub options: Vec<String>,
    /// The current choice; the panel rebuilds on change.
    pub selected: Field<usize>,
    pub width: f32,
    pub height: f32,
    pub binding: Binding,
}

impl Select {
    fn label(&self) -> String {
        match self.selected {
            Field::Value(i) => self.options.get(i).cloned().unwrap_or_default(),
            Field::Mixed => "Mixed".to_string(),
            Field::Empty => "—".to_string(),
        }
    }

    fn list_size(&self) -> [f32; 2] {
        [self.width, self.options.len() as f32 * ROW_H + 2.0 * PAD]
    }

    /// The list row under a point (world coords), if the point is
    /// inside the open list panel.
    fn hit_row(&self, anchor: [f32; 2], point: [f32; 2]) -> Option<usize> {
        let size = self.list_size();
        if point[0] < anchor[0] || point[0] > anchor[0] + size[0] {
            return None;
        }
        let rel = point[1] - (anchor[1] + PAD);
        if rel < 0.0 {
            return None;
        }
        let i = (rel / ROW_H) as usize;
        (i < self.options.len()).then_some(i)
    }

    fn inside_list(&self, anchor: [f32; 2], point: [f32; 2]) -> bool {
        let size = self.list_size();
        point[0] >= anchor[0]
            && point[0] <= anchor[0] + size[0]
            && point[1] >= anchor[1]
            && point[1] <= anchor[1] + size[1]
    }

    fn commit(&self, idx: usize, s: &mut SelectState) -> UiResponse {
        s.open = false;
        s.just_opened = false;
        UiResponse {
            consumed: true,
            emissions: vec![
                Emission {
                    binding: self.binding.clone(),
                    phase: BindingPhase::Begin,
                },
                Emission {
                    binding: self.binding.clone(),
                    phase: BindingPhase::Commit(BindingValue::Index(idx)),
                },
            ],
            capture: false,
            release: true,
            rebuild: true,
        }
    }

    fn dismiss(s: &mut SelectState) -> UiResponse {
        s.open = false;
        s.just_opened = false;
        UiResponse {
            consumed: true,
            release: true,
            rebuild: true,
            ..UiResponse::default()
        }
    }

    fn open_at(&self, bounds: Rectangle, s: &mut SelectState) -> UiResponse {
        s.open = true;
        s.anchor = [bounds.x, bounds.y + bounds.height];
        s.highlight = self.selected.value();
        s.just_opened = true;
        UiResponse {
            consumed: true,
            capture: true,
            rebuild: true,
            ..UiResponse::default()
        }
    }

    fn build_button(&self, ctx: &mut BuildCtx, parent: Parent) -> NodeId {
        let nf = NodeFactory::new();
        let mut button = nf.create_container_node();
        button.layout_container = LayoutContainerStyle {
            layout_mode: LayoutMode::Flex,
            layout_direction: Axis::Horizontal,
            layout_main_axis_alignment: Some(MainAxisAlignment::SpaceBetween),
            layout_cross_axis_alignment: Some(CrossAxisAlignment::Center),
            layout_padding: Some(EdgeInsets {
                top: 0.0,
                right: 6.0,
                bottom: 0.0,
                left: 6.0,
            }),
            ..Default::default()
        };
        button.layout_dimensions.layout_target_width = Some(self.width);
        button.layout_dimensions.layout_target_height = Some(self.height);
        button.fills = Paints::new([Paint::Solid(SolidPaint::new_color(CGColor::from_rgba(
            255, 255, 255, 255,
        )))]);
        button.strokes = Paints::new([Paint::Solid(SolidPaint::new_color(CGColor::from_rgba(
            200, 200, 200, 255,
        )))]);
        button.stroke_width = StrokeWidth::Uniform(1.0);
        button.corner_radius = RectangularCornerRadius::circular(3.0);
        let node = ctx.graph.append_child(Node::Container(button), parent);
        ctx.register(&self.id, node, true, true);

        let mut label = nf.create_text_span_node();
        label.text = self.label();
        label.width = Some(self.width - 24.0);
        label.height = Some(self.height - 6.0);
        label.text_style = TextStyleRec::from_font("Geist", 11.0);
        label.fills = Paints::new([Paint::Solid(SolidPaint::new_color(
            if self.selected.is_value() {
                CGColor::from_rgba(40, 40, 40, 255)
            } else {
                CGColor::from_rgba(150, 150, 150, 255)
            },
        ))]);
        ctx.graph
            .append_child(Node::TextSpan(label), Parent::NodeId(node));

        let mut chevron = nf.create_text_span_node();
        chevron.text = "▾".to_string();
        chevron.width = Some(12.0);
        chevron.height = Some(self.height - 6.0);
        chevron.text_style = TextStyleRec::from_font("Geist", 10.0);
        chevron.text_align = TextAlign::Center;
        chevron.fills = Paints::new([Paint::Solid(SolidPaint::new_color(CGColor::from_rgba(
            120, 120, 120, 255,
        )))]);
        ctx.graph
            .append_child(Node::TextSpan(chevron), Parent::NodeId(node));
        node
    }

    fn build_list(&self, ctx: &mut BuildCtx, s: &SelectState) {
        let nf = NodeFactory::new();
        let panel = popover::build_panel(ctx, s.anchor, self.list_size(), PAD);
        for (i, option) in self.options.iter().enumerate() {
            let hovered = s.highlight == Some(i);
            let mut row = nf.create_container_node();
            row.layout_container = LayoutContainerStyle {
                layout_mode: LayoutMode::Flex,
                layout_direction: Axis::Horizontal,
                layout_cross_axis_alignment: Some(CrossAxisAlignment::Center),
                layout_padding: Some(EdgeInsets {
                    top: 0.0,
                    right: 6.0,
                    bottom: 0.0,
                    left: 6.0,
                }),
                ..Default::default()
            };
            row.layout_dimensions.layout_target_width = Some(self.width - 2.0 * PAD);
            row.layout_dimensions.layout_target_height = Some(ROW_H);
            if hovered {
                row.fills = Paints::new([Paint::Solid(SolidPaint::new_color(CGColor::from_rgba(
                    232, 232, 232, 255,
                )))]);
                row.corner_radius = RectangularCornerRadius::circular(3.0);
            }
            let rnode = ctx
                .graph
                .append_child(Node::Container(row), Parent::NodeId(panel));

            let mut text = nf.create_text_span_node();
            text.text = option.clone();
            text.width = Some(self.width - 2.0 * PAD - 12.0);
            text.height = Some(ROW_H - 8.0);
            text.text_style = TextStyleRec::from_font("Geist", 11.0);
            text.fills = Paints::new([Paint::Solid(SolidPaint::new_color(CGColor::from_rgba(
                40, 40, 40, 255,
            )))]);
            ctx.graph
                .append_child(Node::TextSpan(text), Parent::NodeId(rnode));
        }
    }

    fn key_move(&self, delta: i32, s: &mut SelectState) -> UiResponse {
        let n = self.options.len() as i32;
        if n == 0 {
            return UiResponse::consumed();
        }
        let base = s
            .highlight
            .map(|h| h as i32)
            .unwrap_or(if delta > 0 { -1 } else { n });
        let next = (base + delta).clamp(0, n - 1);
        s.highlight = Some(next as usize);
        UiResponse {
            consumed: true,
            rebuild: true,
            ..UiResponse::default()
        }
    }
}

impl Widget for Select {
    fn id(&self) -> &WidgetId {
        &self.id
    }

    fn default_state(&self) -> WidgetState {
        WidgetState::Select(SelectState::default())
    }

    fn build(&self, ctx: &mut BuildCtx, parent: Parent) -> NodeId {
        let state = match ctx.states.get(&self.id) {
            Some(WidgetState::Select(s)) => *s,
            _ => SelectState::default(),
        };
        // The button is the registered widget root (identity, hit,
        // anchor source). The open list is its own top-level scene
        // root (built at Root by the popover primitive, so the
        // world anchor is correct even when the select is nested in a
        // panel); hit-testing routes through the earned capture.
        let button = self.build_button(ctx, parent);
        if state.open {
            self.build_list(ctx, &state);
        }
        button
    }

    fn handle(
        &self,
        state: &mut WidgetState,
        event: &WidgetEvent,
        bounds: Rectangle,
    ) -> UiResponse {
        let WidgetState::Select(s) = state else {
            return UiResponse::ignored();
        };
        match event {
            WidgetEvent::PointerDown { point, .. } => {
                if !s.open {
                    return self.open_at(bounds, s);
                }
                if self.inside_list(s.anchor, *point) {
                    // Selection resolves on release; keep open.
                    return UiResponse::consumed();
                }
                // A press on the button toggles closed; anywhere else
                // dismisses. Either way the list closes.
                Self::dismiss(s)
            }
            WidgetEvent::PointerMove { point } => {
                if !s.open {
                    return UiResponse::ignored();
                }
                let next = self.hit_row(s.anchor, *point);
                if next != s.highlight {
                    s.highlight = next;
                    return UiResponse {
                        consumed: true,
                        rebuild: true,
                        ..UiResponse::default()
                    };
                }
                UiResponse::consumed()
            }
            WidgetEvent::PointerUp { point, .. } => {
                if !s.open {
                    return UiResponse::ignored();
                }
                if let Some(i) = self.hit_row(s.anchor, *point) {
                    return self.commit(i, s);
                }
                if s.just_opened {
                    // Release of the opening click over the button:
                    // keep the list open (click-to-open).
                    s.just_opened = false;
                    return UiResponse::consumed();
                }
                Self::dismiss(s)
            }
            WidgetEvent::Key { key, .. } => {
                if !s.open {
                    return match key {
                        KeyName::Enter | KeyName::Space | KeyName::ArrowDown => {
                            self.open_at(bounds, s)
                        }
                        _ => UiResponse::ignored(),
                    };
                }
                match key {
                    KeyName::Escape => Self::dismiss(s),
                    KeyName::Enter => match s.highlight {
                        Some(i) => self.commit(i, s),
                        None => UiResponse::consumed(),
                    },
                    KeyName::ArrowDown => self.key_move(1, s),
                    KeyName::ArrowUp => self.key_move(-1, s),
                    _ => UiResponse::consumed(),
                }
            }
        }
    }
}
