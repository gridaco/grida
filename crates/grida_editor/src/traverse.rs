//! Traversal — keyboard selection walks (`docs/wg/canvas/traversal.md`,
//! `TRAV-*` contracts), plus the scope-relative select-all
//! (keybindings.md `Mod+A`).
//!
//! Pure resolution over the working copy: each function maps a current
//! selection to the *next* selection (or `None` for "no change").
//! Traversal is a tree operation, never a canvas pick — inactive nodes
//! are skipped by the sibling walk, locked ones are not (HIER-6's
//! split). Nothing here mutates: the caller sets the selection, which
//! is editor state, not document state (`TRAV-5`'s no-entry half); the
//! camera-reveal half of `TRAV-5` is the host's follow-up.

use crate::document::{Id, WorkingCopy};

/// Scope-relative select-all (`Mod+A`): with a selection, all siblings
/// in the anchor's scope (the first selected node's parent); with
/// nothing selected, all top-level nodes.
pub fn select_all(doc: &WorkingCopy, selection: &[Id]) -> Vec<Id> {
    let scope = selection
        .first()
        .and_then(|id| doc.node_parent(id))
        .unwrap_or(None);
    doc.children(scope.as_ref())
}

/// Enter's descent (`TRAV-1`, the select-children chain member): the
/// union of the selected nodes' children, in document order per
/// parent. Empty when nothing selected or the selection is childless
/// — the caller treats that as a consumed no-op (Enter never falls
/// through to the host).
pub fn children_union(doc: &WorkingCopy, selection: &[Id]) -> Vec<Id> {
    let mut out = Vec::new();
    for id in selection {
        for child in doc.children(Some(id)) {
            if !out.contains(&child) {
                out.push(child);
            }
        }
    }
    out
}

/// Shift+Enter's ascent (`TRAV-2`): the union of parents; top-level
/// members contribute themselves — the scene root is never selected.
/// Returns `None` when the walk changes nothing (all top-level).
pub fn parents_union(doc: &WorkingCopy, selection: &[Id]) -> Option<Vec<Id>> {
    if selection.is_empty() {
        return None;
    }
    let mut out: Vec<Id> = Vec::new();
    for id in selection {
        let up = match doc.node_parent(id) {
            Some(Some(parent)) => parent,
            // Top-level (or unknown): already at the surface.
            _ => id.clone(),
        };
        if !out.contains(&up) {
            out.push(up);
        }
    }
    if out == selection { None } else { Some(out) }
}

/// Tab / Shift+Tab (`TRAV-4`): the traversal anchor's next/previous
/// sibling in document order — wrapping, skipping inactive nodes,
/// including locked ones. A multi-node selection collapses to the
/// anchor's neighbor (the most recently selected node). With an empty
/// selection, the scene's first active top-level node (the keyboard's
/// entry point into the tree).
pub fn sibling(doc: &WorkingCopy, selection: &[Id], forward: bool) -> Option<Id> {
    let active = |id: &Id| doc.node_active(id).unwrap_or(true);
    let Some(anchor) = selection.last() else {
        return doc.children(None).into_iter().find(active);
    };
    let parent = doc.node_parent(anchor)?;
    let ring = doc.children(parent.as_ref());
    let pos = ring.iter().position(|id| id == anchor)?;
    let n = ring.len();
    // Walk the ring from the anchor, skipping inactive; a full lap
    // means no eligible sibling (the anchor may itself be inactive).
    for step in 1..=n {
        let idx = if forward {
            (pos + step) % n
        } else {
            (pos + n - step) % n
        };
        let candidate = &ring[idx];
        if active(candidate) {
            return Some(candidate.clone());
        }
    }
    None
}
