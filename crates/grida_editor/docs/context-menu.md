---
title: Context Menu
description: The right-click command surface — the menu inventory, item sets, and enablement rules, materialized from the production editor.
tags:
  - internal
  - wg
  - editor
format: md
---

The context menu is the pointer's command surface. Every entry
dispatches a command that is also reachable by keybinding, panel, or
headless call — the menu adds **discoverability** and a **targeting
context** (the point and node it was opened over), never capability
(SHELL-3). This document is a UX inventory, not a load-bearing spec:
it materializes what the production editor provides so that the
reference editor's menu — when the [ui](./ui.md) layer grows the
popover primitive it needs — is a checklist, not an invention.

## Doctrine

- **An item is a command reference**: label, displayed binding, and
  an enablement predicate. No menu-only behavior exists. The
  displayed binding is *derived* from the keybinding sheet, never
  authored on the item — a menu cannot show a chord the sheet does
  not own.
- **Enablement mirrors capability.** An item whose command cannot
  apply to the current target renders disabled, not hidden. The only
  label changes are **paired toggles** (Use as mask ⇄ Remove mask,
  Show ⇄ Hide, Lock ⇄ Unlock), which present the applicable direction.
  Where a pure resolver exists, enablement is *exact* capability —
  Bring to front disables for an already-frontmost selection — which
  refines this inventory's coarser "selection non-empty" cells:
  CTX-2 is the contract, the table is the checklist.
- **Opening retargets.** A right-click over an unselected node selects
  it (the ordinary pointer-down selection rule of
  [targeting](../../../docs/wg/canvas/ux-surface/targeting.md)) before the menu opens; over a selected
  node, the selection is preserved. The menu then operates on the
  selection.
- **Point-targeted commands use the opening point.** Paste from the
  canvas menu inserts at the point the menu was opened, not at the
  viewport center — this is the menu's one contextual power.

## Inventory

### Canvas menu

Opened by right-click on the canvas — over content or empty space.
Items in order, separators as rows:

| Item | Enabled when |
| --- | --- |
| Copy | selection non-empty |
| Paste | always (empty canvas paste is legal) |
| Copy as → SVG / PNG | selection non-empty |
| — | |
| Bring to front | selection non-empty |
| Send to back | selection non-empty |
| — | |
| Flatten | every selected node is flattenable |
| Use as mask ⇄ Remove mask | mask: selection non-empty; unmask: selection is a single masked node |
| Edit vector → Planarize | every selected node is a vector |
| — | |
| Group | selection non-empty |
| Ungroup | selection contains a group or boolean node |
| Group with container | selection non-empty |
| Auto-layout | selection non-empty |
| — | |
| Zoom to fit | selection non-empty |
| — | |
| Show ⇄ Hide | selection non-empty |
| Lock ⇄ Unlock | selection non-empty |
| — | |
| Delete | selection non-empty |

The reference editor additionally ships **Copy name** and **Copy ID**
after the clipboard group — single-target clipboard affordances
(development conveniences, not rows materialized from the production
editor). They are ordinary registry commands; CTX-1 holds for them
like any other row.

### Layer-row menu

Opened on a [hierarchy](../../../docs/wg/canvas/hierarchy.md) row. Same command set as the
canvas menu with two deltas: it adds **Rename** (the row's inline
name edit), and it drops **Paste** — paste is point-targeted and a
tree row carries no canvas point.

### Scene-row menu

Opened on a scene row: **Rename**, **Duplicate**, **Delete** — with
Delete disabled while the scene is the document's last (a document
always has at least one scene).

### Ruler menu

Opened on either [ruler](../../../docs/wg/canvas/ruler.md): **Hide ruler**.

Product-mode and workspace menus (slides, file trees) are out of this
cluster's scope.

## Deferred

Named, per the cluster's doctrine (deferred is named, not silently
omitted):

- The reference editor ships the **canvas menu**; the layer-row,
  scene-row, and ruler menus wait on their hosts.
- **Point-targeted paste (CTX-3)** waits on the paste placement rule
  accepting a point.
- A right-click **inside a content edit mode** (vector edit) is
  swallowed today — the in-mode menu is its own inventory, not yet
  materialized.
- Inventory rows whose commands do not exist yet are **not listed**
  rather than shipped permanently disabled (the group cluster, mask,
  planarize, lock, Copy as SVG) — a disabled row must mean "not
  applicable here", never "not built yet".

## Contracts

- **CTX-1** Command-surface equality: every menu item dispatches a
  registry command; enumerating the menus against the command
  registry finds no menu-only behavior (binds SHELL-3 to the menu).
- **CTX-2** Enablement truth: an enabled item's command succeeds on
  the current target; a disabled item's command would refuse. No
  enabled-but-no-op items.
- **CTX-3** Point-targeted paste: pasting from the canvas menu places
  content at the menu's opening point; pasting by keybinding follows
  the [io](../../../docs/wg/canvas/io.md) placement rule.
- **CTX-4** Retargeting: opening the menu over an unselected node
  makes it the selection first; over a selected node, the selection
  is unchanged.
- **CTX-5** Last-scene protection: the scene-row Delete is disabled
  when exactly one scene remains.
