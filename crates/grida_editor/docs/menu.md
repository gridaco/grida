---
title: Menu
description: The command registry made visible — the two menu surfaces (application menu and context menus), their shared model, item sets, and enablement rules, materialized from the production editor.
tags:
  - internal
  - wg
  - editor
format: md
---

A menu is the command registry made visible. Every entry dispatches a
command that is also reachable by keybinding, panel, or headless call —
the menu adds **discoverability** and, for the pointer surfaces, a
**targeting context** (the point and node it was opened over), never
capability (SHELL-3). This crate has two menu surfaces over the one
registry:

- **The application menu** — the persistent top-level bar (File, Edit,
  Object, …). Its job is discovery: it presents the whole command
  taxonomy, grouped, always in reach, not bound to any pointer target.
- **Context menus** — the transient, pointer-targeted surfaces
  (canvas, layer row, scene row, ruler). Their job is a selection- and
  point-scoped subset, opened where the work is.

Both are the same model — a menu is a set of command references — and
share the contracts below (`MENU-1`/`MENU-2`/`MENU-3`); the two
context-only powers (retargeting on open, point-targeted paste) are
scoped to that surface. This document is a UX inventory, not a
load-bearing spec: it materializes what the production editor provides
so that the reference editor's menus — as the [ui](./ui.md) and shell
layers grow the surfaces they need — are a checklist, not an
invention.

## The menu model

- **An item is a command reference**: label, displayed binding, and an
  enablement predicate. No menu-only behavior exists (`MENU-1`). The
  displayed binding is _derived_ from the keybinding sheet
  ([keybindings.md](./keybindings.md)), never authored on the item
  (`MENU-3`) — a menu cannot show a chord the sheet does not own.
- **Enablement mirrors capability.** An item whose command cannot
  apply to the current target renders disabled, not hidden. The only
  label changes are **paired toggles** (Use as mask ⇄ Remove mask,
  Show ⇄ Hide, Lock ⇄ Unlock), which present the applicable direction.
  Where a pure resolver exists, enablement is _exact_ capability —
  Bring to front disables for an already-frontmost selection — which
  refines the inventory tables' coarser "selection non-empty" cells:
  `MENU-2` is the contract, the tables are the checklist.
- **The item-kind taxonomy is deliberately small** — action, submenu,
  separator, and **deferred**. Checkable and radio kinds are refused:
  the paired toggles present the applicable _direction by label_, so
  check state has no owner here.
- **A deferred item is an inert placeholder** (`MENU-7`): a labelled
  row that references **no** command, renders disabled with a
  "(deferred)" suffix, and dispatches nothing. It exists only on the
  application menu, where the menu doubles as a coverage map — it names
  the system a not-yet-built row waits on. This is the one place a
  disabled row means "not built yet"; everywhere else disabled means
  "not applicable here" (`MENU-2`), and it never appears on a context
  menu.

## The application menu

The application menu presents the full command taxonomy for discovery.
It is a view over the same registry — every item is a command
reference (`MENU-1`), its accelerator is sheet-derived (`MENU-3`), its
enablement mirrors capability (`MENU-2`) — with two differences from
the context surfaces: it is **always present** (not opened over a
target) and it is **not point-targeted** (it carries no canvas point,
so the point-targeted paste rule `MENU-4` does not apply; paste from
the application menu follows the ordinary [io](../../../docs/wg/canvas/io.md)
placement rule).

The top-level taxonomy — the standard editor grouping — is **File,
Edit, Object, Arrange, View**, with **Text** while a text content mode
is active and **Settings** last. The production web editor's menu is
the parity target: its full inventory (paths, labels, accelerators)
lives in the [web editor's menu documentation](../../../editor/grida-canvas-hosted/playground/uxhost-menu.md).

**The application menu shows the whole taxonomy, deferred rows
included** — this is the one surface that lists a row before its
command exists. A row is either **live** (wired to a registry command,
enablement per `MENU-2`) or **deferred** (`MENU-7`: inert, disabled,
"(deferred)"-suffixed, naming the system it waits on). The menu is
then a live coverage map: what the editor can do, and what it is still
missing. (The context surfaces keep the opposite rule — a not-built
row is omitted, never shown disabled.)

The tables below are the normative inventory. **Live** columns cite
the registry command; **deferred** rows cite the blocking system. The
web parity target carries rows this crate has no concept of yet
(components, sections); those join the taxonomy as their systems
appear.

### File

| Item           | Wired to · Awaiting                                   |
| -------------- | ----------------------------------------------------- |
| Open .grida    | deferred → file-open command + native file dialog     |
| Save as .grida | `Save` (save-as dialog awaits the native file dialog) |
| Import Image   | deferred → image-import command + native file dialog  |
| Import Figma   | deferred → Figma import path                          |

### Edit

| Item               | Wired to · Awaiting                       |
| ------------------ | ----------------------------------------- |
| Undo / Redo        | `Undo` / `Redo`                           |
| Cut / Copy / Paste | `Cut` / `Copy` / `Paste`                  |
| Copy as PNG        | `CopyAsPng`                               |
| Copy as SVG        | deferred → SVG export (io-external)       |
| Pick color         | deferred → eyedropper / color-pick system |
| Duplicate / Delete | `Duplicate` / `DeleteSelection`           |

### Object

| Item                                             | Wired to · Awaiting                                              |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| Container selection                              | `GroupWithContainer`                                             |
| Group / Ungroup                                  | `Group` / `Ungroup`                                              |
| Bring to front / forward / backward / to back    | `BringToFront` / `BringForward` / `SendBackward` / `SendToBack`  |
| Flatten                                          | `Flatten`                                                        |
| Show ⇄ Hide selection                            | `ToggleVisible`                                                  |
| Boolean ops (union/subtract/intersect/exclude)   | deferred → boolean-ops command family                            |
| Use as mask ⇄ Remove mask                        | deferred → mask system                                           |
| Flip H/V · Rotate 90°/180°                       | deferred → quantized transform ops                               |
| Outline stroke                                   | deferred → stroke→fill geometry                                  |
| Remove fill / Remove stroke / Swap fill & stroke | deferred → paint-list mutations                                  |
| Lock ⇄ Unlock                                    | deferred → lock system (`locked` prop absent from the doc model) |
| Wrap/Convert to section · Convert to container   | deferred → section/frame system                                  |
| Add layout · hug/fill · resize-to-fit            | deferred → layout system (feat-layout)                           |
| Create component · instance/main-component ops   | deferred → component system                                      |
| Rasterize · Hide other layers · Collapse layers  | deferred → layer-panel ops                                       |

### Arrange

| Item                                            | Wired to · Awaiting               |
| ----------------------------------------------- | --------------------------------- |
| Align (left/h-center/right/top/v-center/bottom) | `Align`                           |
| Distribute horizontal / vertical spacing        | `Distribute`                      |
| Distribute left/right/top/bottom/centers        | deferred → edge/center distribute |
| Round to pixel                                  | deferred → pixel-round op         |
| Tidy up · Pack horizontal/vertical              | deferred → tidy/pack layout       |

### View

| Item                             | Wired to · Awaiting                                            |
| -------------------------------- | -------------------------------------------------------------- |
| Zoom in/out/100%/fit/selection   | `ZoomIn` / `ZoomOut` / `Zoom100` / `ZoomFit` / `ZoomSelection` |
| Pixel grid · Ruler               | `TogglePixelGrid` / `ToggleRuler`                              |
| Show/Hide UI                     | `ToggleUi`                                                     |
| Snapping → pixel-grid / geometry | `ToggleSnapPixelGrid` / `ToggleSnapGeometry`                   |
| Minimize UI                      | deferred → minimize-UI view state                              |

### Text — shown only while a text content mode is active

| Item                                                                           | Wired to · Awaiting                      |
| ------------------------------------------------------------------------------ | ---------------------------------------- |
| Bold/Italic/Underline/Strikethrough · link · lists · alignment · adjust · case | deferred → text-attribute command system |

### Settings

| Item               | Wired to · Awaiting                                          |
| ------------------ | ------------------------------------------------------------ |
| General            | deferred → settings dialog system                            |
| Keyboard shortcuts | deferred → keybinding settings UI (the sheet exists as data) |

## Context menus

A context menu is the pointer's command surface: opened by a secondary
press, scoped to the selection, operating at the point it was opened.
Two powers are unique to this surface:

- **Opening retargets** (`MENU-5`). A right-click over an unselected
  node selects it (the ordinary pointer-down selection rule of
  [targeting](../../../docs/wg/canvas/ux-surface/targeting.md)) before the menu
  opens; over a selected node, the selection is preserved. The menu
  then operates on the selection.
- **Point-targeted commands use the opening point** (`MENU-4`). Paste
  from the canvas menu inserts at the point the menu was opened, not at
  the viewport center — this is the menu's one contextual power.

### Canvas menu

Opened by right-click on the canvas — over content or empty space.
Items in order, separators as rows:

| Item                      | Enabled when                                                         |
| ------------------------- | -------------------------------------------------------------------- |
| Copy                      | selection non-empty                                                  |
| Paste                     | always (empty canvas paste is legal)                                 |
| Copy as → SVG / PNG       | selection non-empty                                                  |
| —                         |                                                                      |
| Bring to front            | selection non-empty                                                  |
| Send to back              | selection non-empty                                                  |
| —                         |                                                                      |
| Flatten                   | every selected node is flattenable                                   |
| Use as mask ⇄ Remove mask | mask: selection non-empty; unmask: selection is a single masked node |
| Edit vector → Planarize   | every selected node is a vector                                      |
| —                         |                                                                      |
| Group                     | selection non-empty                                                  |
| Ungroup                   | selection contains a group or boolean node                           |
| Group with container      | selection non-empty                                                  |
| Auto-layout               | selection non-empty                                                  |
| —                         |                                                                      |
| Zoom to fit               | selection non-empty                                                  |
| —                         |                                                                      |
| Show ⇄ Hide               | selection non-empty                                                  |
| Lock ⇄ Unlock             | selection non-empty                                                  |
| —                         |                                                                      |
| Delete                    | selection non-empty                                                  |

The reference editor additionally ships **Copy name** and **Copy ID**
after the clipboard group — single-target clipboard affordances
(development conveniences, not rows materialized from the production
editor). They are ordinary registry commands; `MENU-1` holds for them
like any other row.

### Layer-row menu

Opened on a [hierarchy](../../../docs/wg/canvas/hierarchy.md) row. Same command set as the
canvas menu with two deltas: it adds **Rename** (the row's inline
name edit), and it drops **Paste** — paste is point-targeted and a
tree row carries no canvas point.

### Scene-row menu

Opened on a scene row: **Rename**, **Duplicate**, **Delete** — with
Delete disabled while the scene is the document's last (a document
always has at least one scene, `MENU-6`).

### Ruler menu

Opened on either [ruler](../../../docs/wg/canvas/ruler.md): **Hide ruler**.

Product-mode and workspace menus (slides, file trees) are out of this
document's scope.

## Deferred

Named, per the crate's doctrine (deferred is named, not silently
omitted):

- The reference editor ships the **canvas context menu** and the
  **application menu** (live rows wired, deferred rows shown per
  `MENU-7`); the layer-row, scene-row, and ruler menus wait on their
  hosts. The application-menu inventory above is normative — its
  deferred rows _are_ the enumerated backlog (each names its blocking
  system), not an omission.
- **Point-targeted paste (MENU-4)** waits on the paste placement rule
  accepting a point.
- A right-click **inside a content edit mode** (vector edit) is
  swallowed today — the in-mode menu is its own inventory, not yet
  materialized.
- On the **context** surfaces, a row whose command does not exist yet
  is **not listed** rather than shipped permanently disabled (mask,
  planarize, lock, Copy as SVG) — there a disabled row must mean "not
  applicable here", never "not built yet". Deferred placeholders
  (`MENU-7`) are the application menu's privilege alone.

## Contracts

The shared model (`MENU-1`/`MENU-2`/`MENU-3`) holds for every menu
surface; the surface-scoped contracts (`MENU-4`/`MENU-5`/`MENU-6`)
are the context menus' deltas.

- **MENU-1** Command-surface equality: every **actionable** menu item —
  application menu or context — dispatches a registry command;
  enumerating the menus against the command registry finds no menu-only
  behavior (binds SHELL-3 to the menu). Deferred placeholders (`MENU-7`)
  are exempt: they reference no command and are the only non-actionable
  rows.
- **MENU-2** Enablement truth: an enabled item's command succeeds on
  the current target; a disabled item's command would refuse. No
  enabled-but-no-op items.
- **MENU-3** Derived accelerator: a menu item's displayed binding is
  the keybinding sheet's hint for its command; a command with no chord
  shows no invented hint. A menu can never display a chord the sheet
  does not own.
- **MENU-4** Point-targeted paste: pasting from the canvas menu places
  content at the menu's opening point; pasting by keybinding or from
  the application menu follows the [io](../../../docs/wg/canvas/io.md) placement rule.
- **MENU-5** Retargeting: opening a context menu over an unselected
  node makes it the selection first; over a selected node, the
  selection is unchanged.
- **MENU-6** Last-scene protection: the scene-row Delete is disabled
  when exactly one scene remains.
- **MENU-7** Deferred inertness: a deferred row references no command,
  renders disabled with a "(deferred)" marker, and dispatches nothing
  when activated; deferred rows appear on the application menu only,
  never on a context menu.

> The context-menu contracts were formerly `CTX-1`…`CTX-5`
> (`CTX-1`→`MENU-1`, `CTX-2`→`MENU-2`, `CTX-3`→`MENU-4`,
> `CTX-4`→`MENU-5`, `CTX-5`→`MENU-6`); `MENU-3` is new, promoting the
> sheet-derived-accelerator doctrine to a cited contract.
