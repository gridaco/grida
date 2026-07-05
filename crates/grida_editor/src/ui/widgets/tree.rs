//! `tree` — the hierarchy panel's layers tree
//! (`docs/wg/canvas/hierarchy.md`, `HIER-*`).
//!
//! The widget is a pure view + interaction machine over a flattened
//! row list the panel supplies ([`TreeRow`], visual order — top-to-
//! bottom equals document order *reversed* per sibling level, `HIER-1`).
//! It owns no document access: structural results (selection changes,
//! the one `move` a drop commits) are queued as [`TreeOutput`]s in
//! retained state — an outbox the panel drains and applies through the
//! editor (`ARCH-3`; the preview/commit `Emission` vocabulary is for
//! property patches, so structural commands take this parallel data
//! path rather than overloading it).
//!
//! Geometry is row math: every row is [`ROW_H`] tall; a pointer's row
//! index and gap resolve from `y` against the widget's engine-computed
//! bounds; drop depth resolves from `x` in [`INDENT`] units. Rendering
//! is **windowed**: only rows intersecting the supplied scroll window
//! materialize as nodes (`HIER-7` spirit — flatten is over expanded
//! rows only, and node count is bounded by the viewport), while the
//! root container keeps the full content height so the enclosing
//! scroll container measures real extents.
//!
//! Drag → drop resolution (`HIER-1/2/3`):
//! - Pointer-down on a row arms a drag; it starts past
//!   [`DRAG_THRESHOLD`] px of movement. A selected grabbed row drags
//!   the whole (visible) selection; an unselected one drags itself
//!   only (the multi-drag rule, `HIER-2`).
//! - The middle band of a container row is "into" (append at the
//!   visual top = document-order end); the outer bands are gaps.
//!   Gap candidates span the depths reachable at that gap (the row
//!   below's level, pop-out levels of the row above's ancestor chain,
//!   and "first child of the row above"); the pointer's x picks among
//!   them.
//! - Illegal placements — into a dragged node's own subtree, into a
//!   non-container — resolve to another legal candidate at the gap or
//!   to none; release with no target commits nothing (`HIER-3`).
//! - Document-order indices are computed post-removal (`DOC-5`)
//!   directly from the row list: siblings of one parent are all
//!   visible whenever the parent is expanded.

use std::collections::{HashMap, HashSet};

use grida::cg::prelude::*;
use grida::node::factory::NodeFactory;
use grida::node::scene_graph::Parent;
use grida::node::schema::*;
use math2::rect::Rectangle;
use math2::transform::AffineTransform;

use crate::document::Id;
use crate::ui::widget::{BuildCtx, UiResponse, Widget, WidgetEvent, WidgetId, WidgetState};

/// Row height, logical px.
pub const ROW_H: f32 = 20.0;
/// Indent per depth level, logical px (also the drop-depth unit).
pub const INDENT: f32 = 14.0;
/// Width of the disclosure hit zone at the row's indent.
pub const DISCLOSURE_W: f32 = 14.0;
/// Pointer movement (px) before an armed drag starts.
pub const DRAG_THRESHOLD: f32 = 4.0;

/// One visible row of the flattened tree, in visual order.
#[derive(Debug, Clone, PartialEq)]
pub struct TreeRow {
    pub id: Id,
    /// Parent stable id (`None` = scene root level).
    pub parent: Option<Id>,
    pub depth: usize,
    /// Display name (the panel falls back to the stable id).
    pub name: String,
    /// Container kinds accept "into" drops and show a disclosure.
    pub is_container: bool,
    /// Document child count (for "into" drop indices).
    pub child_count: usize,
    pub expanded: bool,
    /// `active=false` rows render dimmed.
    pub active: bool,
    pub selected: bool,
}

/// A resolved drop placement: document-order parent + post-removal
/// index (`DOC-5`), plus where the indicator renders.
#[derive(Debug, Clone, PartialEq)]
pub struct DropTarget {
    pub parent: Option<Id>,
    pub index: usize,
    pub indicator: DropIndicator,
}

/// Where the drop indicator draws, in visual row coordinates.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum DropIndicator {
    /// A line at the gap above visual row `i` (== below row `i−1`).
    Gap(usize),
    /// A highlight over row `i` ("into" a container).
    Into(usize),
}

/// An armed (maybe started) drag.
#[derive(Debug, Clone, PartialEq)]
pub struct TreeDrag {
    /// Visual index of the grabbed row.
    pub pressed: usize,
    pub origin: [f32; 2],
    /// Toggle modifier held at pointer-down (click-select semantics).
    pub toggle: bool,
    /// Past the movement threshold: this is a drag, not a click.
    pub started: bool,
    /// Current resolved placement (`None` = no legal drop here).
    pub target: Option<DropTarget>,
}

/// A structural command produced by the tree, applied by the panel
/// through the editor (see module docs).
#[derive(Debug, Clone, PartialEq)]
pub enum TreeOutput {
    /// Replace the editor selection.
    SetSelection(Vec<Id>),
    /// Commit one recorded `Mutation::Move` (post-removal index).
    Move {
        ids: Vec<Id>,
        parent: Option<Id>,
        index: usize,
    },
}

/// Retained tree state (`UI-2`). Expansion is transient panel state —
/// never persisted, never in history (`hierarchy.md`).
#[derive(Debug, Clone, PartialEq, Default)]
pub struct TreeState {
    /// Expanded container ids.
    pub expanded: HashSet<Id>,
    /// Open drag, if any.
    pub drag: Option<TreeDrag>,
    /// Output queue (drained by the panel).
    pub out: Vec<TreeOutput>,
}

pub struct Tree {
    pub id: WidgetId,
    pub width: f32,
    /// Flattened visible rows, visual order (panel-supplied).
    pub rows: Vec<TreeRow>,
    /// The full editor selection (may include ids without a visible
    /// row) — toggle-clicks preserve the invisible remainder.
    pub selection: Vec<Id>,
    /// Visible window in content coordinates `(scroll_offset, height)`;
    /// `None` builds every row (small trees, tests).
    pub window: Option<(f32, f32)>,
}

impl Tree {
    /// Full content height (drives the scroll container's extent).
    fn content_height(&self) -> f32 {
        self.rows.len() as f32 * ROW_H
    }

    /// Visual row index under a pointer `y` (widget-local), if any.
    fn row_at(&self, y_local: f32) -> Option<usize> {
        if y_local < 0.0 {
            return None;
        }
        let i = (y_local / ROW_H).floor() as usize;
        (i < self.rows.len()).then_some(i)
    }

    /// The ids a drag starting on `pressed` moves (`HIER-2`): the whole
    /// visible selection when the grabbed row is selected, the grabbed
    /// row alone otherwise. Ordered bottom-most row first — ascending
    /// document order — so the single splice preserves the dragged
    /// rows' relative visual order.
    fn dragged_ids(&self, pressed: usize) -> Vec<Id> {
        if self.rows[pressed].selected {
            let mut rows: Vec<usize> = (0..self.rows.len())
                .filter(|&i| self.rows[i].selected)
                .collect();
            rows.sort_by(|a, b| b.cmp(a));
            rows.into_iter().map(|i| self.rows[i].id.clone()).collect()
        } else {
            vec![self.rows[pressed].id.clone()]
        }
    }

    /// Resolve the drop placement for a pointer position (see module
    /// docs). `dragged` are the moving ids.
    fn resolve_drop(
        &self,
        dragged: &[Id],
        point: [f32; 2],
        bounds: Rectangle,
    ) -> Option<DropTarget> {
        if self.rows.is_empty() {
            return None;
        }
        let dragged: HashSet<&Id> = dragged.iter().collect();
        let index_of: HashMap<&Id, usize> = self
            .rows
            .iter()
            .enumerate()
            .map(|(i, r)| (&r.id, i))
            .collect();

        let y = (point[1] - bounds.y).clamp(0.0, self.content_height() - 0.001);
        let r = ((y / ROW_H).floor() as usize).min(self.rows.len() - 1);
        let frac = (y - r as f32 * ROW_H) / ROW_H;

        // Middle band: "into" the row — containers only; a leaf's
        // middle band resolves to none (HIER-3: not a nearest-legal
        // fallback, so a scripted into-a-leaf drop commits nothing).
        if (0.25..0.75).contains(&frac) {
            let row = &self.rows[r];
            if !row.is_container {
                return None;
            }
            if self.chain_hits_dragged(Some(&row.id), &dragged, &index_of) {
                return None;
            }
            // Append at the visual top = document-order end,
            // post-removal: current children minus dragged direct
            // children.
            let dragged_children = self
                .rows
                .iter()
                .filter(|s| s.parent.as_ref() == Some(&row.id) && dragged.contains(&s.id))
                .count();
            return Some(DropTarget {
                parent: Some(row.id.clone()),
                index: row.child_count - dragged_children,
                indicator: DropIndicator::Into(r),
            });
        }

        // Gap g sits above visual row g (0 ..= len).
        let g = if frac < 0.25 { r } else { r + 1 };
        let above = g.checked_sub(1).map(|i| &self.rows[i]);
        let below = self.rows.get(g);

        // Candidate placements at this gap, deepest first.
        let mut candidates: Vec<(usize, Option<Id>, usize, DropIndicator)> = Vec::new();
        // "First visible child of the row above": only when the row
        // below already lives inside it (the gap is at that level) or
        // the row above is an expanded, childless container.
        if let Some(a) = above {
            let below_is_child = below.is_some_and(|b| b.parent.as_ref() == Some(&a.id));
            if below_is_child {
                // Covered by the below-candidate at depth a.depth+1;
                // nothing extra to add.
            } else if a.is_container && a.expanded && a.child_count == 0 {
                candidates.push((a.depth + 1, Some(a.id.clone()), 0, DropIndicator::Gap(g)));
            }
        }
        if let Some(b) = below {
            // Insert visually above `b`, among its siblings: document
            // index = non-dragged siblings at-or-below the gap.
            let index = self.sibling_count_from(b.parent.as_ref(), g, &dragged);
            candidates.push((b.depth, b.parent.clone(), index, DropIndicator::Gap(g)));
        }
        if let Some(a) = above {
            // Pop-out levels: insert visually below `a`'s ancestor at
            // each shallower depth (document index = non-dragged
            // siblings strictly below it).
            let floor_depth = below.map(|b| b.depth).unwrap_or(0);
            let mut node = a;
            loop {
                if node.depth < floor_depth {
                    break;
                }
                // Skip the level the below-candidate already covers.
                if below.is_none()
                    || node.depth != floor_depth
                    || below.is_some_and(|b| b.parent != node.parent)
                {
                    let index = self.sibling_count_from(node.parent.as_ref(), g, &dragged);
                    candidates.push((
                        node.depth,
                        node.parent.clone(),
                        index,
                        DropIndicator::Gap(g),
                    ));
                }
                if node.depth == 0 {
                    break;
                }
                let Some(pid) = node.parent.as_ref() else {
                    break;
                };
                let Some(&pi) = index_of.get(pid) else {
                    break;
                };
                node = &self.rows[pi];
            }
        }
        if candidates.is_empty() {
            return None;
        }

        // Depth from x picks among the candidates (nearest wins;
        // deeper wins ties because deeper candidates come first).
        let depth_x = ((point[0] - bounds.x) / INDENT).floor().max(0.0) as usize;
        candidates.sort_by_key(|(d, ..)| *d);
        candidates.reverse();
        candidates
            .into_iter()
            .filter(|(_, parent, ..)| {
                !self.chain_hits_dragged(parent.as_ref(), &dragged, &index_of)
            })
            .min_by_key(|(d, ..)| d.abs_diff(depth_x))
            .map(|(_, parent, index, indicator)| DropTarget {
                parent,
                index,
                indicator,
            })
    }

    /// Non-dragged rows sharing `parent` whose visual index is `>= g`
    /// — the post-removal document index for an insertion at gap `g`
    /// (visually above a row == after it in document order).
    fn sibling_count_from(&self, parent: Option<&Id>, g: usize, dragged: &HashSet<&Id>) -> usize {
        self.rows
            .iter()
            .enumerate()
            .filter(|(i, s)| {
                *i >= g
                    && s.parent.as_deref() == parent.map(|p| p.as_str())
                    && !dragged.contains(&s.id)
            })
            .count()
    }

    /// Whether `parent` (or any of its ancestors) is a dragged id —
    /// the "into own subtree" guard (`HIER-3`).
    fn chain_hits_dragged(
        &self,
        parent: Option<&Id>,
        dragged: &HashSet<&Id>,
        index_of: &HashMap<&Id, usize>,
    ) -> bool {
        let mut cursor = parent.cloned();
        while let Some(id) = cursor {
            if dragged.contains(&id) {
                return true;
            }
            cursor = index_of.get(&id).and_then(|&i| self.rows[i].parent.clone());
        }
        false
    }
}

impl Widget for Tree {
    fn id(&self) -> &WidgetId {
        &self.id
    }

    fn default_state(&self) -> WidgetState {
        WidgetState::Tree(TreeState::default())
    }

    fn build(&self, ctx: &mut BuildCtx, parent: Parent) -> NodeId {
        let (drag_indicator, dragging) = match ctx.states.get(&self.id) {
            Some(WidgetState::Tree(s)) => match &s.drag {
                Some(d) if d.started => (d.target.as_ref().map(|t| t.indicator), true),
                _ => (None, false),
            },
            _ => (None, false),
        };
        let nf = NodeFactory::new();

        // Root: a non-flex container at the full content height (the
        // scroll container measures it); row visuals position by
        // schema coordinates.
        let mut root = nf.create_container_node();
        root.layout_dimensions.layout_target_width = Some(self.width);
        root.layout_dimensions.layout_target_height = Some(self.content_height().max(1.0));
        root.fills = Paints::default();
        root.clip = false;
        let node = ctx.graph.append_child(Node::Container(root), parent);
        ctx.register(&self.id, node, false, true);

        // Windowing (HIER-7 spirit): materialize only rows
        // intersecting the scroll window.
        let (first, last) = match self.window {
            Some((offset, height)) => {
                let first = ((offset / ROW_H).floor().max(0.0)) as usize;
                let last = (((offset + height) / ROW_H).ceil() as usize).min(self.rows.len());
                (first.min(self.rows.len()), last)
            }
            None => (0, self.rows.len()),
        };

        for (i, row) in self.rows.iter().enumerate().take(last).skip(first) {
            let y = i as f32 * ROW_H;
            let indent = row.depth as f32 * INDENT;

            if row.selected {
                let mut bg = nf.create_rectangle_node();
                bg.transform = AffineTransform::new(0.0, y, 0.0);
                bg.size = Size {
                    width: self.width,
                    height: ROW_H,
                };
                bg.fills = Paints::new([Paint::Solid(SolidPaint::new_color(CGColor::from_rgba(
                    210, 225, 245, 255,
                )))]);
                ctx.graph
                    .append_child(Node::Rectangle(bg), Parent::NodeId(node));
            }

            let text_alpha: u8 = if row.active { 255 } else { 110 };
            if row.is_container && row.child_count > 0 {
                let mut marker = nf.create_text_span_node();
                marker.text = if row.expanded { "▾" } else { "▸" }.to_string();
                marker.transform = AffineTransform::new(indent, y + 3.0, 0.0);
                marker.width = Some(DISCLOSURE_W);
                marker.height = Some(ROW_H - 6.0);
                marker.text_style = TextStyleRec::from_font("Geist", 9.0);
                marker.fills = Paints::new([Paint::Solid(SolidPaint::new_color(
                    CGColor::from_rgba(90, 90, 90, text_alpha),
                ))]);
                ctx.graph
                    .append_child(Node::TextSpan(marker), Parent::NodeId(node));
            }

            let mut name = nf.create_text_span_node();
            name.text = row.name.clone();
            name.transform = AffineTransform::new(indent + DISCLOSURE_W, y + 3.0, 0.0);
            name.width = Some((self.width - indent - DISCLOSURE_W).max(8.0));
            name.height = Some(ROW_H - 6.0);
            name.text_style = TextStyleRec::from_font("Geist", 11.0);
            name.fills = Paints::new([Paint::Solid(SolidPaint::new_color(CGColor::from_rgba(
                40, 40, 40, text_alpha,
            )))]);
            ctx.graph
                .append_child(Node::TextSpan(name), Parent::NodeId(node));
        }

        // Drop indicator while a drag is live.
        if dragging {
            match drag_indicator {
                Some(DropIndicator::Gap(g)) => {
                    let mut line = nf.create_rectangle_node();
                    line.transform =
                        AffineTransform::new(0.0, (g as f32 * ROW_H - 1.0).max(0.0), 0.0);
                    line.size = Size {
                        width: self.width,
                        height: 2.0,
                    };
                    line.fills = Paints::new([Paint::Solid(SolidPaint::new_color(
                        CGColor::from_rgba(40, 110, 220, 255),
                    ))]);
                    ctx.graph
                        .append_child(Node::Rectangle(line), Parent::NodeId(node));
                }
                Some(DropIndicator::Into(r)) => {
                    let mut band = nf.create_rectangle_node();
                    band.transform = AffineTransform::new(0.0, r as f32 * ROW_H, 0.0);
                    band.size = Size {
                        width: self.width,
                        height: ROW_H,
                    };
                    band.fills = Paints::new([Paint::Solid(SolidPaint::new_color(
                        CGColor::from_rgba(40, 110, 220, 60),
                    ))]);
                    ctx.graph
                        .append_child(Node::Rectangle(band), Parent::NodeId(node));
                }
                None => {}
            }
        }

        node
    }

    fn handle(
        &self,
        state: &mut WidgetState,
        event: &WidgetEvent,
        bounds: Rectangle,
    ) -> UiResponse {
        let WidgetState::Tree(s) = state else {
            return UiResponse::ignored();
        };
        match event {
            WidgetEvent::PointerDown { point, modifiers } => {
                let Some(i) = self.row_at(point[1] - bounds.y) else {
                    return UiResponse::consumed();
                };
                let row = &self.rows[i];
                let x_local = point[0] - bounds.x;
                let indent = row.depth as f32 * INDENT;
                // Disclosure zone: toggle expansion, arm nothing.
                if row.is_container
                    && row.child_count > 0
                    && (indent..indent + DISCLOSURE_W).contains(&x_local)
                {
                    if !s.expanded.remove(&row.id) {
                        s.expanded.insert(row.id.clone());
                    }
                    return UiResponse::consumed();
                }
                // Arm a drag; selection resolves on release (so a drag
                // of an unselected row leaves selection unchanged,
                // HIER-2).
                s.drag = Some(TreeDrag {
                    pressed: i,
                    origin: *point,
                    toggle: modifiers.ctrl_or_cmd,
                    started: false,
                    target: None,
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
                if !drag.started {
                    let (dx, dy) = (point[0] - drag.origin[0], point[1] - drag.origin[1]);
                    if (dx * dx + dy * dy).sqrt() < DRAG_THRESHOLD {
                        return UiResponse::consumed();
                    }
                    drag.started = true;
                }
                let pressed = drag.pressed;
                let dragged = self.dragged_ids(pressed);
                let target = self.resolve_drop(&dragged, *point, bounds);
                if let Some(drag) = &mut s.drag {
                    drag.target = target;
                }
                UiResponse::consumed()
            }
            WidgetEvent::PointerUp { .. } => {
                let Some(drag) = s.drag.take() else {
                    return UiResponse::ignored();
                };
                if drag.started {
                    // Drop: commit one move if a legal target resolved.
                    if let Some(target) = drag.target {
                        s.out.push(TreeOutput::Move {
                            ids: self.dragged_ids(drag.pressed),
                            parent: target.parent,
                            index: target.index,
                        });
                    }
                } else {
                    // Click: replace selection, or toggle membership.
                    let id = self.rows[drag.pressed].id.clone();
                    let selection = if drag.toggle {
                        let mut selection = self.selection.clone();
                        if let Some(pos) = selection.iter().position(|s| *s == id) {
                            selection.remove(pos);
                        } else {
                            selection.push(id);
                        }
                        selection
                    } else {
                        vec![id]
                    };
                    s.out.push(TreeOutput::SetSelection(selection));
                }
                UiResponse {
                    consumed: true,
                    emissions: Vec::new(),
                    capture: false,
                    release: true,
                    rebuild: false,
                }
            }
            WidgetEvent::Key { .. } => UiResponse::ignored(),
        }
    }
}
