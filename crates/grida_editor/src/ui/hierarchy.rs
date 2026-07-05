//! The hierarchy panel — the layers tree strip
//! (`docs/wg/canvas/hierarchy.md`, `HIER-*`).
//!
//! Mirrors the [`properties`] panel shape: it **reads** the editor via
//! queries and rebuilds the tree widget when the displayed data
//! changed; every edit flows through the editor (`ARCH-3`). The tree
//! widget queues structural commands ([`TreeOutput`]) in its retained
//! state; [`apply`] maps them onto the editor — a `SetSelection`
//! replaces the selection (not recorded, M1), a `Move` is dispatched
//! as one recorded mutation (one history entry, undo restores
//! structure exactly).
//!
//! Flattening is over expanded rows only, front-on-top: per sibling
//! level, visual order is document order reversed (`HIER-1`); the
//! scene root is hidden (its children are the top-level rows).
//! Expansion lives in the tree widget's retained state — transient,
//! never persisted, never in history. On an external selection change
//! the panel *reveals*: it expands exactly the ancestor chain of the
//! newly selected nodes (collapsing nothing) and scrolls the first
//! selected row into view (`HIER-4`).
//!
//! [`properties`]: crate::ui::properties

use std::collections::HashSet;

use grida::node::schema::Size;

use crate::document::{Id, Mutation};
use crate::editor::{Editor, Recording};
use crate::history::Origin;
use crate::ui::UiLayer;
use crate::ui::scroll::{Scroll, ScrollState};
use crate::ui::widget::WidgetState;
use crate::ui::widgets::Panel;
use crate::ui::widgets::tree::{ROW_H, Tree, TreeOutput, TreeRow, TreeState};

/// Widget identity slots.
pub const PANEL_ID: &str = "hier.panel";
pub const SCROLL_ID: &str = "hier.scroll";
pub const TREE_ID: &str = "hier.tree";

/// Panel chrome: padding (12) × 2 + title (18) + gap (8).
const CHROME_H: f32 = 12.0 * 2.0 + 18.0 + 8.0;

/// Scroll viewport height for a panel filling `viewport_h`.
pub fn scroll_height(viewport_h: f32) -> f32 {
    (viewport_h - CHROME_H).max(ROW_H)
}

/// What the panel was last built from.
#[derive(Debug, Clone, PartialEq)]
struct Snapshot {
    rows: Vec<TreeRow>,
    selection: Vec<Id>,
    scroll_offset: f32,
    /// Live drag placement (rebuild moves the drop indicator).
    drag: Option<crate::ui::widgets::tree::DropTarget>,
}

/// What applying a batch of tree outputs did — the shell mirrors
/// structure changes into the renderer (bridge flush) and re-syncs
/// selection-dependent surfaces.
#[derive(Debug, Default)]
pub struct AppliedOutputs {
    /// The editor selection was replaced.
    pub selection_changed: bool,
    /// A recorded `Move` was committed (history changed, structure
    /// changed — wholesale renderer re-flush).
    pub moved: bool,
}

/// Apply drained tree outputs to the editor (the single mutation
/// authority). Mechanical, like [`crate::ui::bind::apply`].
pub fn apply(editor: &mut Editor, outputs: &[TreeOutput]) -> AppliedOutputs {
    let mut out = AppliedOutputs::default();
    for output in outputs {
        match output {
            TreeOutput::SetSelection(ids) => {
                editor.set_selection(ids.clone());
                out.selection_changed = true;
            }
            TreeOutput::Move { ids, parent, index } => {
                if editor
                    .dispatch(
                        vec![Mutation::Move {
                            ids: ids.clone(),
                            parent: parent.clone(),
                            index: *index,
                        }],
                        Origin::Local,
                        Recording::Record {
                            label: Some("hier.move".to_string()),
                        },
                    )
                    .is_ok()
                {
                    out.moved = true;
                }
            }
        }
    }
    out
}

/// Flatten the editor's document into visible rows (visual order,
/// `HIER-1`): children of the hidden scene root, reversed per sibling
/// level, descending only into `expanded` containers.
pub fn flatten(editor: &Editor, expanded: &HashSet<Id>) -> Vec<TreeRow> {
    let mut rows = Vec::new();
    let selection: HashSet<&Id> = editor.selection().iter().collect();
    flatten_level(editor, expanded, &selection, None, 0, &mut rows);
    rows
}

fn flatten_level(
    editor: &Editor,
    expanded: &HashSet<Id>,
    selection: &HashSet<&Id>,
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

/// The left-side hierarchy strip.
pub struct HierarchyPanel {
    /// Fixed strip width, logical px.
    pub width: f32,
    snapshot: Option<Snapshot>,
}

impl HierarchyPanel {
    pub fn new(width: f32) -> Self {
        Self {
            width,
            snapshot: None,
        }
    }

    /// Forget the built state; the next [`sync`](Self::sync) does a
    /// full rebuild.
    pub fn invalidate(&mut self) {
        self.snapshot = None;
    }

    /// Drain the tree widget's queued outputs (empties the outbox).
    pub fn drain(&self, ui: &mut UiLayer) -> Vec<TreeOutput> {
        match ui.state_mut(&TREE_ID.to_string()) {
            Some(WidgetState::Tree(s)) => std::mem::take(&mut s.out),
            _ => Vec::new(),
        }
    }

    /// Drain + apply + re-sync in one step (the shell/tests call this
    /// after routing an input event to the panel's UI layer).
    pub fn handle(&mut self, ui: &mut UiLayer, editor: &mut Editor) -> AppliedOutputs {
        let outputs = self.drain(ui);
        let applied = apply(editor, &outputs);
        self.sync(ui, editor);
        applied
    }

    /// Reconcile the panel with the editor: reveal on external
    /// selection change (`HIER-4`), then rebuild the tree widget when
    /// rows / selection / scroll / drag-indicator changed; no-op
    /// otherwise.
    pub fn sync(&mut self, ui: &mut UiLayer, editor: &Editor) {
        let tree_id = TREE_ID.to_string();
        let scroll_id = SCROLL_ID.to_string();

        // Current retained state (defaults before the first mount).
        let mut tree_state = match ui.state(&tree_id) {
            Some(WidgetState::Tree(s)) => s.clone(),
            _ => TreeState::default(),
        };
        let mut scroll_offset = match ui.state(&scroll_id) {
            Some(WidgetState::Scroll(s)) => s.offset,
            _ => 0.0,
        };

        let selection: Vec<Id> = editor.selection().to_vec();
        let selection_changed = self
            .snapshot
            .as_ref()
            .map(|s| s.selection != selection)
            .unwrap_or(true);

        // Reveal (HIER-4): expand exactly the ancestor chain of the
        // newly selected nodes — additive, collapsing nothing.
        if selection_changed {
            for id in &selection {
                let mut cursor = editor.document().node_parent(id).flatten();
                while let Some(ancestor) = cursor {
                    cursor = editor.document().node_parent(&ancestor).flatten();
                    tree_state.expanded.insert(ancestor);
                }
            }
        }

        let rows = flatten(editor, &tree_state.expanded);

        // Reveal, part 2: scroll the first selected row into view.
        let viewport_h = scroll_height(ui.viewport().height);
        if selection_changed
            && let Some(head) = selection.first()
            && let Some(i) = rows.iter().position(|r| r.id == *head)
        {
            let row_top = i as f32 * ROW_H;
            let max = (rows.len() as f32 * ROW_H - viewport_h).max(0.0);
            if row_top < scroll_offset {
                scroll_offset = row_top.min(max);
            } else if row_top + ROW_H > scroll_offset + viewport_h {
                scroll_offset = (row_top + ROW_H - viewport_h).clamp(0.0, max);
            }
        }

        let snapshot = Snapshot {
            rows,
            selection,
            scroll_offset,
            drag: tree_state
                .drag
                .as_ref()
                .filter(|d| d.started)
                .and_then(|d| d.target.clone()),
        };
        if self.snapshot.as_ref() == Some(&snapshot) {
            return;
        }

        // Write layer-owned state the panel drives (reveal expansion,
        // scroll-into-view) *before* building, so the build sees it.
        ui.set_state(tree_id.clone(), WidgetState::Tree(tree_state));
        ui.set_state(
            scroll_id.clone(),
            WidgetState::Scroll(ScrollState {
                offset: snapshot.scroll_offset,
            }),
        );

        let tree = self.tree(&snapshot, viewport_h);
        let offset_unchanged = self
            .snapshot
            .as_ref()
            .is_some_and(|s| s.scroll_offset == snapshot.scroll_offset);
        if offset_unchanged && ui.widget_root(&tree_id).is_some() {
            // The tree is a leaf widget: in-place subtree swap. (An
            // offset change instead re-mounts, because the scroll
            // container's content position is built from ScrollState.)
            ui.rebuild_widget(&tree_id, Box::new(tree));
        } else {
            let viewport = ui.viewport();
            ui.mount(vec![Box::new(self.panel(viewport, tree))]);
        }
        self.snapshot = Some(snapshot);
    }

    fn panel(&self, viewport: Size, tree: Tree) -> Panel {
        Panel {
            id: PANEL_ID.to_string(),
            title: "Layers".to_string(),
            origin: (0.0, 0.0),
            width: self.width,
            height: viewport.height,
            children: vec![Box::new(Scroll {
                id: SCROLL_ID.to_string(),
                width: self.width - 24.0,
                height: scroll_height(viewport.height),
                gap: 0.0,
                children: vec![Box::new(tree)],
            })],
        }
    }

    fn tree(&self, snapshot: &Snapshot, viewport_h: f32) -> Tree {
        Tree {
            id: TREE_ID.to_string(),
            width: self.width - 24.0,
            rows: snapshot.rows.clone(),
            selection: snapshot.selection.clone(),
            window: Some((snapshot.scroll_offset, viewport_h)),
        }
    }
}
