//! `segmented` — the "one-of-N, all options visible" atom
//! (`widgets.md` "segmented"; the inventory's value shape
//! *one-of-N, options visible*). A horizontal icon/label group **or**
//! a grid (via [`Segmented::columns`]) — the nine-position alignment
//! control is this same widget with `columns = 3` and nine options,
//! per the value-shape doctrine (two controls of the same shape are
//! one atom).
//!
//! Exactly one option is active; one click commits that option
//! (`Begin` → `Commit`, one history entry). Arrow keys move the
//! selection and commit per press (radio semantics): Right/Left step
//! by one, Down/Up step by a row. The selected option is a
//! [`Field<usize>`] — `Mixed` renders nothing active and its first
//! edit broadcasts the chosen index (`WID-6`).
//!
//! Stateless: like the slider, the whole group is one registered
//! widget and the clicked sub-cell is resolved from the pointer
//! against the widget's engine-computed bounds — no retained state.

use grida::cg::prelude::*;
use grida::node::factory::NodeFactory;
use grida::node::scene_graph::Parent;
use grida::node::schema::*;
use grida::text_edit::session::KeyName;
use math2::rect::Rectangle;

use crate::ui::bind::{Binding, BindingPhase, BindingValue, Emission};
use crate::ui::field::Field;
use crate::ui::widget::{BuildCtx, UiResponse, Widget, WidgetEvent, WidgetId, WidgetState};

/// One selectable option: a short label or glyph.
#[derive(Debug, Clone)]
pub struct Segment {
    pub label: String,
}

impl Segment {
    pub fn new(label: impl Into<String>) -> Self {
        Self {
            label: label.into(),
        }
    }
}

pub struct Segmented {
    pub id: WidgetId,
    pub options: Vec<Segment>,
    /// Active option index; the panel rebuilds on change.
    pub selected: Field<usize>,
    /// Columns for a grid layout; `0` (or `>= options.len()`) is a
    /// single row.
    pub columns: usize,
    pub width: f32,
    pub height: f32,
    pub binding: Binding,
}

impl Segmented {
    fn cols(&self) -> usize {
        if self.columns == 0 || self.columns >= self.options.len() {
            self.options.len().max(1)
        } else {
            self.columns
        }
    }

    fn rows(&self) -> usize {
        let cols = self.cols();
        self.options.len().div_ceil(cols).max(1)
    }

    fn cell_size(&self) -> (f32, f32) {
        (
            self.width / self.cols() as f32,
            self.height / self.rows() as f32,
        )
    }

    /// The option index under a pointer, resolved against the group's
    /// world bounds.
    fn hit(&self, point: [f32; 2], bounds: Rectangle) -> Option<usize> {
        if bounds.width <= 0.0 || bounds.height <= 0.0 {
            return None;
        }
        let (cw, ch) = self.cell_size();
        let col = (((point[0] - bounds.x) / cw) as i32).clamp(0, self.cols() as i32 - 1) as usize;
        let row = (((point[1] - bounds.y) / ch) as i32).clamp(0, self.rows() as i32 - 1) as usize;
        let idx = row * self.cols() + col;
        (idx < self.options.len()).then_some(idx)
    }

    fn commit(&self, idx: usize) -> UiResponse {
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
            release: false,
            rebuild: false,
        }
    }

    /// Radio-key move: clamp into range and commit; `None` when the
    /// move leaves the group (no wrap).
    fn key_move(&self, delta: i32) -> UiResponse {
        let n = self.options.len() as i32;
        if n == 0 {
            return UiResponse::ignored();
        }
        let base = self.selected.value_or(0) as i32;
        let target = (base + delta).clamp(0, n - 1);
        if target == base && self.selected.is_value() {
            return UiResponse::consumed();
        }
        self.commit(target as usize)
    }
}

impl Widget for Segmented {
    fn id(&self) -> &WidgetId {
        &self.id
    }

    fn build(&self, ctx: &mut BuildCtx, parent: Parent) -> NodeId {
        let nf = NodeFactory::new();
        let (cw, ch) = self.cell_size();
        let cols = self.cols();

        // Outer group: a vertical flex of grid rows (a single row when
        // `cols == options.len()`). Flex flow, so every row and cell
        // lays out (the engine positions only the first *absolute*
        // child of a flex parent — flow avoids that trap).
        let mut group = nf.create_container_node();
        group.layout_container = LayoutContainerStyle {
            layout_mode: LayoutMode::Flex,
            layout_direction: Axis::Vertical,
            layout_gap: Some(LayoutGap::uniform(0.0)),
            ..Default::default()
        };
        group.layout_dimensions.layout_target_width = Some(self.width);
        group.layout_dimensions.layout_target_height = Some(self.height);
        group.strokes = Paints::new([Paint::Solid(SolidPaint::new_color(CGColor::from_rgba(
            200, 200, 200, 255,
        )))]);
        group.stroke_width = StrokeWidth::Uniform(1.0);
        group.corner_radius = RectangularCornerRadius::circular(3.0);
        group.clip = true;
        let node = ctx.graph.append_child(Node::Container(group), parent);
        ctx.register(&self.id, node, true, true);

        let selected = self.selected.value();
        for row in 0..self.rows() {
            let mut row_node = nf.create_container_node();
            row_node.layout_container = LayoutContainerStyle {
                layout_mode: LayoutMode::Flex,
                layout_direction: Axis::Horizontal,
                layout_gap: Some(LayoutGap::uniform(0.0)),
                ..Default::default()
            };
            row_node.layout_dimensions.layout_target_width = Some(self.width);
            row_node.layout_dimensions.layout_target_height = Some(ch);
            let rnode = ctx
                .graph
                .append_child(Node::Container(row_node), Parent::NodeId(node));

            for col in 0..cols {
                let idx = row * cols + col;
                if idx >= self.options.len() {
                    break;
                }
                let active = selected == Some(idx);
                let mut cell = nf.create_container_node();
                cell.layout_container = LayoutContainerStyle {
                    layout_mode: LayoutMode::Flex,
                    layout_direction: Axis::Vertical,
                    layout_main_axis_alignment: Some(MainAxisAlignment::Center),
                    layout_cross_axis_alignment: Some(CrossAxisAlignment::Center),
                    ..Default::default()
                };
                cell.layout_dimensions.layout_target_width = Some(cw);
                cell.layout_dimensions.layout_target_height = Some(ch);
                cell.fills = Paints::new([Paint::Solid(SolidPaint::new_color(if active {
                    CGColor::from_rgba(50, 50, 50, 255)
                } else {
                    CGColor::from_rgba(245, 245, 245, 255)
                }))]);
                let cnode = ctx
                    .graph
                    .append_child(Node::Container(cell), Parent::NodeId(rnode));

                let mut text = nf.create_text_span_node();
                text.text = self.options[idx].label.clone();
                text.width = Some(cw);
                text.height = Some(ch - 6.0);
                text.text_style = TextStyleRec::from_font("Geist", 11.0);
                text.text_align = TextAlign::Center;
                text.fills = Paints::new([Paint::Solid(SolidPaint::new_color(if active {
                    CGColor::from_rgba(255, 255, 255, 255)
                } else {
                    CGColor::from_rgba(60, 60, 60, 255)
                }))]);
                ctx.graph
                    .append_child(Node::TextSpan(text), Parent::NodeId(cnode));
            }
        }
        node
    }

    fn handle(
        &self,
        _state: &mut WidgetState,
        event: &WidgetEvent,
        bounds: Rectangle,
    ) -> UiResponse {
        match event {
            WidgetEvent::PointerDown { point, .. } => match self.hit(*point, bounds) {
                Some(idx) => self.commit(idx),
                None => UiResponse::consumed(),
            },
            WidgetEvent::Key { key, .. } => match key {
                KeyName::ArrowRight => self.key_move(1),
                KeyName::ArrowLeft => self.key_move(-1),
                KeyName::ArrowDown => self.key_move(self.cols() as i32),
                KeyName::ArrowUp => self.key_move(-(self.cols() as i32)),
                _ => UiResponse::ignored(),
            },
            _ => UiResponse::ignored(),
        }
    }
}
