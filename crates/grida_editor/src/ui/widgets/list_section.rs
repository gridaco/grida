//! `list_section` — the `SHEET-3` machinery: an ordered list of
//! entries with **add** (from the header), per-entry **remove** and
//! **toggle-active**, and **reorder** by drag. Every operation is one
//! commit-only binding carrying the affected index
//! ([`BindingValue::ListOp`]) — property-scoped, one history entry
//! each. Fills, strokes, effects, and export are all instances of
//! this one widget; only the per-entry *content* (a paint control, an
//! effect control) differs, and that is assembled from the value
//! atoms above the list.
//!
//! Monolithic: the structural ops fold the entry index into one
//! compound emission, and the header/active/remove/handle sub-regions
//! hit-test against the section's own geometry (the segmented/quad
//! pattern). This widget owns *structure*; an entry's value editing
//! is a separate control the panel places inside the entry row.

use grida::cg::prelude::*;
use grida::node::factory::NodeFactory;
use grida::node::scene_graph::Parent;
use grida::node::schema::*;
use math2::rect::Rectangle;

use crate::ui::bind::{Binding, BindingPhase, BindingValue, Emission, ListOp};
use crate::ui::widget::{BuildCtx, UiResponse, Widget, WidgetEvent, WidgetId, WidgetState};

/// Header height (holds the add button).
const HEADER_H: f32 = 22.0;
/// Entry row height.
pub const ENTRY_H: f32 = 24.0;
/// Width of the active-box and remove hit regions.
const CTRL_W: f32 = 24.0;
/// Add-button width (right of the header).
const ADD_W: f32 = 28.0;

/// One list entry's display data (the panel supplies label + active;
/// the entry's value control is placed separately).
#[derive(Debug, Clone, PartialEq)]
pub struct ListEntry {
    pub label: String,
    pub active: bool,
}

/// Retained list state (`UI-2`): an in-flight reorder drag.
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct ListState {
    /// The entry index being dragged and the current pointer y.
    pub drag: Option<(usize, f32)>,
}

pub struct ListSection {
    pub id: WidgetId,
    pub title: String,
    pub entries: Vec<ListEntry>,
    pub width: f32,
    pub binding: Binding,
}

impl ListSection {
    fn total_height(&self) -> f32 {
        HEADER_H + self.entries.len() as f32 * ENTRY_H
    }

    fn commit(&self, op: ListOp) -> UiResponse {
        UiResponse {
            consumed: true,
            emissions: vec![
                Emission {
                    binding: self.binding.clone(),
                    phase: BindingPhase::Begin,
                },
                Emission {
                    binding: self.binding.clone(),
                    phase: BindingPhase::Commit(BindingValue::ListOp(op)),
                },
            ],
            rebuild: true,
            ..UiResponse::default()
        }
    }

    /// The add-button region (right of the header).
    fn add_rect(&self, b: Rectangle) -> Rectangle {
        Rectangle {
            x: b.x + self.width - ADD_W,
            y: b.y,
            width: ADD_W,
            height: HEADER_H,
        }
    }

    /// The entry index at a pointer y (in the entries band), if any.
    fn entry_at(&self, point: [f32; 2], b: Rectangle) -> Option<usize> {
        let rel = point[1] - (b.y + HEADER_H);
        if rel < 0.0 {
            return None;
        }
        let i = (rel / ENTRY_H) as usize;
        (i < self.entries.len()).then_some(i)
    }

    /// Where in an entry row a point falls: `Active` (left box),
    /// `Remove` (right box), or `Handle` (the body — the drag grip).
    fn entry_region(&self, point: [f32; 2], b: Rectangle) -> EntryRegion {
        let rel_x = point[0] - b.x;
        if rel_x < CTRL_W {
            EntryRegion::Active
        } else if rel_x > self.width - CTRL_W {
            EntryRegion::Remove
        } else {
            EntryRegion::Handle
        }
    }
}

enum EntryRegion {
    Active,
    Remove,
    Handle,
}

impl Widget for ListSection {
    fn id(&self) -> &WidgetId {
        &self.id
    }

    fn default_state(&self) -> WidgetState {
        WidgetState::List(ListState::default())
    }

    fn build(&self, ctx: &mut BuildCtx, parent: Parent) -> NodeId {
        let nf = NodeFactory::new();
        let mut body = nf.create_container_node();
        body.layout_container = LayoutContainerStyle {
            layout_mode: LayoutMode::Flex,
            layout_direction: Axis::Vertical,
            layout_gap: Some(LayoutGap::uniform(0.0)),
            ..Default::default()
        };
        body.layout_dimensions.layout_target_width = Some(self.width);
        body.layout_dimensions.layout_target_height = Some(self.total_height());
        let node = ctx.graph.append_child(Node::Container(body), parent);
        ctx.register(&self.id, node, true, true);

        // Header: title + add button.
        let mut header = nf.create_container_node();
        header.layout_container = LayoutContainerStyle {
            layout_mode: LayoutMode::Flex,
            layout_direction: Axis::Horizontal,
            layout_main_axis_alignment: Some(MainAxisAlignment::SpaceBetween),
            layout_cross_axis_alignment: Some(CrossAxisAlignment::Center),
            ..Default::default()
        };
        header.layout_dimensions.layout_target_width = Some(self.width);
        header.layout_dimensions.layout_target_height = Some(HEADER_H);
        let hnode = ctx
            .graph
            .append_child(Node::Container(header), Parent::NodeId(node));
        push_text(
            ctx,
            &nf,
            hnode,
            &self.title,
            self.width - ADD_W,
            12.0,
            rgb(20),
        );
        push_text(ctx, &nf, hnode, "＋", ADD_W, 14.0, rgb(80));

        // Entry rows.
        for entry in &self.entries {
            let mut row = nf.create_container_node();
            row.layout_container = LayoutContainerStyle {
                layout_mode: LayoutMode::Flex,
                layout_direction: Axis::Horizontal,
                layout_cross_axis_alignment: Some(CrossAxisAlignment::Center),
                ..Default::default()
            };
            row.layout_dimensions.layout_target_width = Some(self.width);
            row.layout_dimensions.layout_target_height = Some(ENTRY_H);
            let rnode = ctx
                .graph
                .append_child(Node::Container(row), Parent::NodeId(node));

            // Active box.
            let mut abox = nf.create_container_node();
            abox.layout_dimensions.layout_target_width = Some(CTRL_W);
            abox.layout_dimensions.layout_target_height = Some(ENTRY_H);
            abox.layout_container = LayoutContainerStyle {
                layout_mode: LayoutMode::Flex,
                layout_main_axis_alignment: Some(MainAxisAlignment::Center),
                layout_cross_axis_alignment: Some(CrossAxisAlignment::Center),
                ..Default::default()
            };
            let anode = ctx
                .graph
                .append_child(Node::Container(abox), Parent::NodeId(rnode));
            push_text(
                ctx,
                &nf,
                anode,
                if entry.active { "◉" } else { "○" },
                CTRL_W,
                12.0,
                if entry.active { rgb(40) } else { rgb(170) },
            );

            // Label (dimmed when inactive).
            push_text(
                ctx,
                &nf,
                rnode,
                &entry.label,
                self.width - 2.0 * CTRL_W,
                11.0,
                if entry.active { rgb(40) } else { rgb(160) },
            );

            // Remove.
            let mut rbox = nf.create_container_node();
            rbox.layout_dimensions.layout_target_width = Some(CTRL_W);
            rbox.layout_dimensions.layout_target_height = Some(ENTRY_H);
            rbox.layout_container = LayoutContainerStyle {
                layout_mode: LayoutMode::Flex,
                layout_main_axis_alignment: Some(MainAxisAlignment::Center),
                layout_cross_axis_alignment: Some(CrossAxisAlignment::Center),
                ..Default::default()
            };
            let rmnode = ctx
                .graph
                .append_child(Node::Container(rbox), Parent::NodeId(rnode));
            push_text(ctx, &nf, rmnode, "✕", CTRL_W, 11.0, rgb(150));
        }
        node
    }

    fn handle(
        &self,
        state: &mut WidgetState,
        event: &WidgetEvent,
        bounds: Rectangle,
    ) -> UiResponse {
        let WidgetState::List(s) = state else {
            return UiResponse::ignored();
        };
        match event {
            WidgetEvent::PointerDown { point, .. } => {
                if self.add_rect(bounds).contains_point(*point) {
                    return self.commit(ListOp::Add);
                }
                let Some(i) = self.entry_at(*point, bounds) else {
                    return UiResponse::consumed();
                };
                match self.entry_region(*point, bounds) {
                    EntryRegion::Active => self.commit(ListOp::ToggleEntry(i)),
                    EntryRegion::Remove => self.commit(ListOp::Remove(i)),
                    EntryRegion::Handle => {
                        // Begin a reorder drag.
                        s.drag = Some((i, point[1]));
                        UiResponse {
                            consumed: true,
                            capture: true,
                            ..UiResponse::default()
                        }
                    }
                }
            }
            WidgetEvent::PointerMove { point } => {
                if let Some((from, _)) = s.drag {
                    s.drag = Some((from, point[1]));
                    return UiResponse::consumed();
                }
                UiResponse::ignored()
            }
            WidgetEvent::PointerUp { point, .. } => {
                let Some((from, _)) = s.drag.take() else {
                    return UiResponse::ignored();
                };
                let to = self
                    .entry_at(*point, bounds)
                    .unwrap_or(self.entries.len().saturating_sub(1));
                let mut res = if to != from {
                    self.commit(ListOp::Move { from, to })
                } else {
                    UiResponse::consumed()
                };
                res.release = true;
                res
            }
            _ => UiResponse::ignored(),
        }
    }
}

fn rgb(v: u8) -> CGColor {
    CGColor::from_rgba(v, v, v, 255)
}

fn push_text(
    ctx: &mut BuildCtx,
    nf: &NodeFactory,
    parent: NodeId,
    text: &str,
    width: f32,
    size: f32,
    color: CGColor,
) {
    let mut span = nf.create_text_span_node();
    span.text = text.to_string();
    span.width = Some(width);
    span.height = Some(size + 4.0);
    span.text_style = TextStyleRec::from_font("Geist", size);
    span.fills = Paints::new([Paint::Solid(SolidPaint::new_color(color))]);
    ctx.graph
        .append_child(Node::TextSpan(span), Parent::NodeId(parent));
}
