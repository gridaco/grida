---
title: Editor State Model
description: The editor's state domains — content, authoring context, view, interaction, collaboration — and the lifecycle contract each domain membership implies.
tags:
  - internal
  - wg
  - editor
format: md
---

An editor instance is a single authority over several **state
domains**. Every piece of editor state belongs to exactly one domain,
and the domain decides its full lifecycle: whether it is persisted,
whether undo restores it, whether it replicates to collaborators, and
whether it is shared across views or owned per view. Placing a field
in the right domain is a contract, not a filing choice — most
historical editor bugs (undo restoring the camera, remote edits
polluting local undo, hover state leaking into saved files) are domain
violations.

## The domains

| Domain | Contents | Persisted | Undoable | Replicated | Scope |
| --- | --- | --- | --- | --- | --- |
| **Content** | The document: nodes, hierarchy, order, properties, scenes | yes | yes | yes (document sync) | document |
| **Authoring context** | Selection, active scene, content-edit mode, isolation | no | yes | as presence only | editor |
| **View** | Camera transform, zoom, viewport size | no | **never** | as presence only | per view |
| **Interaction** | Active gesture, hover, marquee/lasso, active tool, pointer, modifier state | no | never | no | per view |
| **Collaboration** | Remote cursors, remote selections, presence, ephemeral chat | no | never | remote-sourced | editor |

Two rows deserve emphasis:

- **Authoring context is undoable but not persisted.** Undoing a
  deletion must restore the selection that existed before it; but a
  saved file carries no selection. This asymmetry is deliberate and is
  the reason authoring context is a domain of its own rather than part
  of content or interaction.
- **View state is never undoable.** Undo never moves the camera. If a
  host wants "zoom to the undone change," that is a view policy
  applied *after* undo, not a property of history.

## Mutation authority

The editor is the **single mutation choke-point** for content and
authoring context. All changes — pointer gestures, commands, remote
sync, agent actions — enter through one mutation vocabulary and are
classified there. Nothing else writes to these domains. This single
entry point is what makes history (every entry passes through it),
sync (every local change can be broadcast), and render invalidation
(every change can be classified) possible without heroics.

Interaction and view state, by contrast, are written freely by the
input pipeline and view controllers; they carry no such ceremony
because nothing downstream depends on observing their transitions.

## Intent phases

Interactive edits pass through two phases:

- **preview** — a tentative change shown live during a gesture. A
  preview is visible in the rendered view but has not entered history
  and is not broadcast as a committed change. Replacing or discarding
  a preview leaves no trace.
- **commit** — the change becomes real: it enters history as one
  entry and is eligible for replication.

Every gesture that mutates content must declare which phase it is in;
"committed on every mouse-move" is a spec violation (it floods history
and sync), and "never committed" is a data-loss bug.

## Views

One editor instance drives **one document and N views**. Each view
owns its own view and interaction state; content, authoring context,
and collaboration state are shared. A conforming implementation with a
single hard-wired view must still keep the domains separate such that
adding a second view is a host change, not an editor redesign.
