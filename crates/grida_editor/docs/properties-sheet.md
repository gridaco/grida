---
title: Properties Sheet
description: The full property inventory of the inspector — every section, property, and control kind, in panel order, with its visibility gate.
tags:
  - internal
  - wg
  - editor
format: md
---

This is the **inventory** behind the [properties panel](./properties.md):
every section and every property the inspector exposes, in panel
order, materialized from the production editor. The behavioral
semantics — capability-gated visibility, the mixed-value model,
preview/commit, computed vs authored — live in the panel spec and
are not restated per row. A row here is a claim: _this property
exists on the document model, is editable through the panel, and is
equally reachable headlessly._

Sections render top-to-bottom in this order; each names its
visibility gate (the PROP-1 capability rule made concrete).

## Identity — always

| Property         | Control             |
| ---------------- | ------------------- |
| name             | text input (inline) |
| visible (active) | toggle              |
| locked           | toggle              |

## Arrangement — any selection

| Property               | Control                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------- |
| align / distribute row | button row ([align](../../../docs/wg/canvas/align.md))                                |
| position (x, y)        | number pair; insets against the parent frame, with the opposite-edge insets available |
| positioning mode       | absolute ⇄ relative (in-flow)                                                         |
| rotation               | number, scrubbable label                                                              |

## Size & layout — sized nodes; layout controls on containers

| Property             | Control                                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------- |
| width / height       | number pair, each in one of three modes: fixed / percent / auto; linked by an aspect-ratio lock |
| layout mode          | flow ⇄ flex-horizontal ⇄ flex-vertical (containers)                                             |
| main/cross alignment | nine-position grid (flex)                                                                       |
| gap                  | number with presets; splits into main/cross gaps when wrapping                                  |
| wrap                 | toggle (flex)                                                                                   |
| padding              | uniform ⇄ per-side (four values)                                                                |
| clip content         | toggle (containers)                                                                             |

## Appearance — visual nodes

| Property                                | Control                                                      |
| --------------------------------------- | ------------------------------------------------------------ |
| opacity                                 | slider + scrubbable number, 0–1                              |
| blend mode                              | grouped select (normal, darken/multiply/…, hue/…/luminosity) |
| corner radius                           | uniform ⇄ per-corner (four values), presets                  |
| point count                             | number 3–60 (polygon, star)                                  |
| inner ratio                             | number 0–1 (star, donut)                                     |
| arc: start angle / sweep / inner radius | number triple (arc shapes)                                   |

## Fills — paintable nodes

An ordered **paint list** (displayed top-most first, stored in paint
order — the panel owns the reversal):

| Per paint           | Control                                                    |
| ------------------- | ---------------------------------------------------------- |
| kind                | solid / linear / radial / sweep / diamond gradient / image |
| color (solid)       | color picker with alpha                                    |
| stops (gradients)   | stop list: offset + color, add/remove                      |
| image (image paint) | source + fit + transform                                   |
| opacity, blend mode | slider, select                                             |
| active              | toggle (disable without delete)                            |

List operations: add (sensible default appended), remove, reorder —
each one committed batch (PROP-6 guards heterogeneous lists).

## Strokes — strokeable nodes

The same paint-list model as fills, plus stroke geometry:

| Property            | Control                                                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| width               | uniform ⇄ per-side                                                                                                      |
| align               | inside / center / outside                                                                                               |
| cap                 | none (butt) / round / square                                                                                            |
| join                | miter / round / bevel; miter limit appears when miter                                                                   |
| dash pattern        | number sequence (solid ⇄ dashed)                                                                                        |
| start / end markers | none / arrow / triangle / circle / square / diamond / bar (line-like nodes; the arrow-tool contract TOOL-9 rides these) |

## Effects — effect-capable nodes

An effect list; kinds and their properties:

| Kind                | Properties                         |
| ------------------- | ---------------------------------- |
| drop / inner shadow | offset (x, y), blur, spread, color |
| layer blur          | radius                             |
| backdrop blur       | radius                             |
| noise               | amount/parameters                  |

Each entry: active toggle, remove; add from the section header.

## Text — text nodes

Primary row, always visible for text:

| Property         | Control                         |
| ---------------- | ------------------------------- |
| font family      | font picker                     |
| style / weight   | select + italic toggle          |
| size             | number with presets             |
| line height      | number, scrubbable              |
| letter spacing   | number, scrubbable              |
| horizontal align | left / center / right / justify |
| vertical align   | top / middle / bottom           |

Advanced (behind the section's detail affordance): decoration (line,
style, color, thickness, skip-ink), text transform (case), max
lines, word spacing, variable-font axes (per-axis sliders), OpenType
features (per-tag toggles), kerning, optical sizing.

## Image — image nodes

| Property | Control                       |
| -------- | ----------------------------- |
| source   | resource picker               |
| fit      | none / contain / cover / fill |

## Mask — masked nodes

| Property  | Control                           |
| --------- | --------------------------------- |
| mask type | select; remove-mask in the header |

## Selection colors — multi-paint selections

The distinct paints across the whole selection, aggregated: each
row recolors every occurrence in one commit, with a select-by-color
affordance (select all nodes carrying that paint). Appears when the
selection carries more than one distinct paint.

## Export

Per-node export presets: format (PNG, SVG, PDF, …) and scale;
multiple presets per node; renders from committed state (IO-7).

## Developer

Freeform user data attached to the node (host-optional; the
reference editor treats it as an opaque bag).

Host-specific sections (link/interaction properties on DOM-rendered
hosts) exist in production but are outside the reference editor's
scope — named here so their absence is a decision.

## Mode overrides

Two states replace the node inventory wholesale: **vector edit**
shows the sub-selection's geometry properties
([vector-edit](../../../docs/wg/feat-vector-network/vector-edit.md)), and the **scale tool** shows its
parametric scale controls. Both are the same panel surface obeying
the same binding contract.

## Contracts

- **SHEET-1** Inventory–capability agreement: every row above
  renders exactly under its stated gate (binds PROP-1 to this
  concrete list); no control ever renders for a selection that
  cannot accept its property.
- **SHEET-2** No panel-only property: every row corresponds to a
  document property mutable headlessly by the same mutation the
  control commits (ARCH-3 measured at the panel).
- **SHEET-3** List sections (fills, strokes, effects, export) all
  support add / remove / toggle-active / reorder as single committed
  batches.
