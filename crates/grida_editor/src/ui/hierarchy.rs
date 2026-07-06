//! Hierarchy (layers-tree) logic — the pure, view-agnostic half
//! (`docs/wg/canvas/hierarchy.md`, `HIER-*`).
//!
//! The panel *view* lives in the egui shell (`shell::egui_panels`); this
//! module owns only the document→rows flattening and the drag→drop
//! geometry, as pure functions the view calls. Every edit still flows
//! through the editor (`ARCH-3`): the view writes selection directly and
//! commits one recorded `Mutation::Move` per drop (one history entry;
//! undo restores structure exactly).
//!
//! Flattening is over expanded rows only, front-on-top: per sibling
//! level, visual order is document order reversed (`HIER-1`); the scene
//! root is hidden (its children are the top-level rows). Expansion is
//! transient view state the caller owns — never persisted, never in
//! history.
//!
//! These functions were the retired `Tree` widget's methods; they moved
//! here (with the row/drop types) when the widget framework was replaced
//! by egui, so the drop resolution stays one implementation.

use std::collections::{HashMap, HashSet};

use math2::rect::Rectangle;

use crate::document::{Id, NodeKind};
use crate::editor::Editor;

/// Row height, logical px (also the drop-band unit).
pub const ROW_H: f32 = 20.0;
/// Indent per depth level, logical px (also the drop-depth unit).
pub const INDENT: f32 = 14.0;

/// One visible row of the flattened tree, in visual order.
#[derive(Debug, Clone, PartialEq)]
pub struct TreeRow {
    pub id: Id,
    /// Parent stable id (`None` = scene root level).
    pub parent: Option<Id>,
    pub depth: usize,
    /// Display name (falls back to the stable id).
    pub name: String,
    /// Display category, for the row's per-type icon.
    pub kind: NodeKind,
    /// Container kinds accept "into" drops and show a disclosure.
    pub is_container: bool,
    /// Document child count (for "into" drop indices).
    pub child_count: usize,
    pub expanded: bool,
    /// `active=false` rows render dimmed.
    pub active: bool,
    pub selected: bool,
}

/// A resolved drop placement: document-order parent + post-removal index
/// (`DOC-5`), plus where the indicator renders.
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

/// Flatten the editor's document into visible rows (visual order,
/// `HIER-1`): children of the hidden scene root, reversed per sibling
/// level, descending only into `expanded` containers.
pub fn flatten(editor: &Editor, expanded: &HashSet<Id>) -> Vec<TreeRow> {
    let mut rows = Vec::new();
    // The selection is small; a slice membership check per row beats
    // allocating a `HashSet` every frame.
    flatten_level(editor, expanded, editor.selection(), None, 0, &mut rows);
    rows
}

fn flatten_level(
    editor: &Editor,
    expanded: &HashSet<Id>,
    selection: &[Id],
    parent: Option<&Id>,
    depth: usize,
    rows: &mut Vec<TreeRow>,
) {
    let doc = editor.document();
    for id in editor.children(parent).into_iter().rev() {
        let children = editor.children(Some(&id));
        let is_container = doc.node_is_container(&id).unwrap_or(false);
        let is_expanded = expanded.contains(&id);
        let name = match doc.node_name(&id) {
            Some(n) if !n.is_empty() => n,
            _ => id.clone(),
        };
        rows.push(TreeRow {
            parent: parent.cloned(),
            depth,
            name,
            kind: doc.node_kind(&id).unwrap_or(NodeKind::Other),
            is_container,
            child_count: children.len(),
            expanded: is_expanded,
            active: doc.node_active(&id).unwrap_or(true),
            selected: selection.contains(&id),
            id: id.clone(),
        });
        if is_expanded {
            flatten_level(editor, expanded, selection, Some(&id), depth + 1, rows);
        }
    }
}

// ── Drag → drop geometry (pure; the egui panel calls these) ───────────
//
// `bounds` is the rows' content rect (origin = visual row 0's top-left,
// width = row width, height = rows × `ROW_H`); `point` is the pointer in
// the same space.

/// The ids a drag grabbing visual row `pressed` moves (`HIER-2`): the
/// whole visible selection when the grabbed row is selected, the grabbed
/// row alone otherwise. Ordered bottom-most-first (ascending document
/// order) so a single splice preserves the dragged rows' relative order.
pub fn dragged_ids(rows: &[TreeRow], pressed: usize) -> Vec<Id> {
    if rows[pressed].selected {
        let mut idxs: Vec<usize> = (0..rows.len()).filter(|&i| rows[i].selected).collect();
        idxs.sort_by(|a, b| b.cmp(a));
        idxs.into_iter().map(|i| rows[i].id.clone()).collect()
    } else {
        vec![rows[pressed].id.clone()]
    }
}

/// Resolve the drop placement for a pointer position (`HIER-1/2/3`): the
/// middle band of a container row is "into" it; the outer bands are gaps
/// whose reachable depths (the row below's level, pop-out levels of the
/// row above's ancestor chain, first-child-of-the-row-above) are picked
/// among by the pointer's x. Illegal placements (into a dragged node's
/// own subtree, into a leaf) resolve to another legal candidate or
/// `None`. `dragged` are the moving ids.
pub fn resolve_drop(
    rows: &[TreeRow],
    dragged: &[Id],
    point: [f32; 2],
    bounds: Rectangle,
) -> Option<DropTarget> {
    if rows.is_empty() {
        return None;
    }
    let content_height = rows.len() as f32 * ROW_H;
    let dragged: HashSet<&Id> = dragged.iter().collect();
    let index_of: HashMap<&Id, usize> = rows.iter().enumerate().map(|(i, r)| (&r.id, i)).collect();

    let y = (point[1] - bounds.y).clamp(0.0, content_height - 0.001);
    let r = ((y / ROW_H).floor() as usize).min(rows.len() - 1);
    let frac = (y - r as f32 * ROW_H) / ROW_H;

    // Middle band: "into" the row — containers only; a leaf's middle
    // band resolves to none (`HIER-3`: no nearest-legal fallback).
    if (0.25..0.75).contains(&frac) {
        let row = &rows[r];
        if !row.is_container {
            return None;
        }
        if chain_hits_dragged(rows, Some(&row.id), &dragged, &index_of) {
            return None;
        }
        // Append at the visual top = document-order end, post-removal.
        let dragged_children = rows
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
    let above = g.checked_sub(1).map(|i| &rows[i]);
    let below = rows.get(g);

    // Candidate placements at this gap, deepest first.
    let mut candidates: Vec<(usize, Option<Id>, usize, DropIndicator)> = Vec::new();
    if let Some(a) = above {
        let below_is_child = below.is_some_and(|b| b.parent.as_ref() == Some(&a.id));
        if below_is_child {
            // Covered by the below-candidate at depth a.depth+1.
        } else if a.is_container && a.expanded && a.child_count == 0 {
            candidates.push((a.depth + 1, Some(a.id.clone()), 0, DropIndicator::Gap(g)));
        }
    }
    if let Some(b) = below {
        let index = sibling_count_from(rows, b.parent.as_ref(), g, &dragged);
        candidates.push((b.depth, b.parent.clone(), index, DropIndicator::Gap(g)));
    }
    if let Some(a) = above {
        // Pop-out levels: insert visually below `a`'s ancestor at each
        // shallower depth.
        let floor_depth = below.map(|b| b.depth).unwrap_or(0);
        let mut node = a;
        loop {
            if node.depth < floor_depth {
                break;
            }
            if below.is_none()
                || node.depth != floor_depth
                || below.is_some_and(|b| b.parent != node.parent)
            {
                let index = sibling_count_from(rows, node.parent.as_ref(), g, &dragged);
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
            node = &rows[pi];
        }
    }
    if candidates.is_empty() {
        return None;
    }

    // Depth from x picks among the candidates (nearest wins; deeper wins
    // ties because deeper candidates come first).
    let depth_x = ((point[0] - bounds.x) / INDENT).floor().max(0.0) as usize;
    candidates.sort_by_key(|(d, ..)| *d);
    candidates.reverse();
    candidates
        .into_iter()
        .filter(|(_, parent, ..)| !chain_hits_dragged(rows, parent.as_ref(), &dragged, &index_of))
        .min_by_key(|(d, ..)| d.abs_diff(depth_x))
        .map(|(_, parent, index, indicator)| DropTarget {
            parent,
            index,
            indicator,
        })
}

/// Non-dragged rows sharing `parent` whose visual index is `>= g` — the
/// post-removal document index for an insertion at gap `g`.
fn sibling_count_from(
    rows: &[TreeRow],
    parent: Option<&Id>,
    g: usize,
    dragged: &HashSet<&Id>,
) -> usize {
    rows.iter()
        .enumerate()
        .filter(|(i, s)| {
            *i >= g && s.parent.as_deref() == parent.map(|p| p.as_str()) && !dragged.contains(&s.id)
        })
        .count()
}

/// Whether `parent` (or any ancestor) is a dragged id — the "into own
/// subtree" guard (`HIER-3`).
fn chain_hits_dragged(
    rows: &[TreeRow],
    parent: Option<&Id>,
    dragged: &HashSet<&Id>,
    index_of: &HashMap<&Id, usize>,
) -> bool {
    let mut cursor = parent.cloned();
    while let Some(id) = cursor {
        if dragged.contains(&id) {
            return true;
        }
        cursor = index_of.get(&id).and_then(|&i| rows[i].parent.clone());
    }
    false
}
