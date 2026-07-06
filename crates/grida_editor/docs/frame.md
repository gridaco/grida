---
title: Frame
description: Presentation reconciliation — how document changes become painted pixels, exactly once, through a damage ledger and a single reflect point.
tags:
  - internal
  - wg
  - editor
format: md
---

The **frame** concept is the contract between document truth and
painted pixels. The editor core owns the document
([editor.md](./editor.md)); the rendering engine owns the pixels — and
between them sits a renderer that caches aggressively (recorded
pictures, composited layers, viewport snapshots) and paints **only
when a frame is scheduled**. Mutating a mirrored scene does not
repaint it; requesting a window redraw does not repaint it either —
the renderer's flush is gated on its own frame queue. Presentation is
therefore not a side effect of editing. It is a reconciliation that
must be _orchestrated_, and this document names the orchestration.

## The failure this exists to prevent

Without a named frame concept, every mutation call site re-derives
the same checklist by hand: mirror the change into the renderer
(narrowly? wholesale?), invalidate the right caches, schedule a
frame, re-sync the panels, request a host redraw. Call sites that get
one step wrong produce the characteristic split-brain: _the document
is right, the screen is stale_ — a panel edit that appears only after
the next hover, a drag preview that materializes only on pointer-up,
while a remote peer (whose path happens to reload wholesale) repaints
instantly. Per-call-site render plumbing is not an orchestration
mechanism, exactly as per-event selection flags were not a
reconciliation mechanism (`SURF-7`).

## The damage ledger

The editor core accrues **damage**: the change summaries
([document.md](./document.md), `DOC-7`) of every applied batch —
local, remote, or agent origin; recorded, silent preview, undo, redo,
or gesture-abort rollback — merged into one ledger since the last
drain. Damage is data, not a callback: per-node `(id, change-kind)`
pairs plus a **structural** bit set when any applied batch inserted,
removed, or re-parented nodes (and when a document is loaded). The
ledger is drained atomically by the presentation host; draining is
the only way it empties.

The ledger is deliberately the same shape the engine uses internally
(its scene-dirty set, drained once per frame by its own invalidation
pass). The editor⇄renderer boundary gets the design the engine
already proved, one level up.

## The reflect point

The host reconciles at **one choke point**: after every host event
that can reach the editor (pointer, key, command, sync drain), it
drains the ledger and reflects it into the renderer:

- **Empty damage** — nothing happens. No frame is scheduled, no
  redraw is requested; an idle editor stays idle.
- **Structural damage** — the renderer scene is reloaded wholesale
  from the working copy. Wholesale reload rebuilds every renderer
  cache and schedules a frame itself.
- **Property damage only** — the post-state node records are copied
  into the renderer scene, each marked with its summary change kind
  (the narrowest invalidation the renderer supports), and **a frame
  is scheduled** through the renderer's queue. Marking caches dirty
  without scheduling a frame is the half-measure this contract
  exists to forbid: the caches would rebuild on the next
  incidentally-triggered frame, which is exactly the "stale until
  hover" failure.

Reflection also drives everything else derived from document state —
panel re-syncs, the window title — from the same drain, so "document
changed" has exactly one fan-out point in the host.

## What is not damage

- **Selection** is not document damage; it reconciles through the
  selection-authority choke point (`SURF-7`) and panels re-sync
  there.
- **Camera and chrome** (pan, zoom, hover, marquee visuals) belong to
  the engine's own event → queue path; they schedule frames without
  touching the ledger.
- **Editor-UI visuals** (widget hover/focus/scroll) are the UI
  layer's redraws ([ui.md](./ui.md)), not document damage.
- **Engine-internal editing sessions** (text edit) mutate the
  renderer scene directly while active and schedule their own frames;
  the editor's frame closes when the session ends
  ([tool.md](../../../docs/wg/canvas/tool.md), `TOOL-6`). While such a session is active,
  its node's renderer state is authoritative for pixels.

## Contracts

- **FRAME-1** No lost frames: any change applied to the document —
  any origin, any recording mode, including silent previews, undo/
  redo, and gesture-abort rollbacks — is visible in the next frame
  presented after the host's reflect point runs. No further input of
  any kind is required to make it appear.
- **FRAME-2** Single reflection authority: the host drains the damage
  ledger and reflects it at exactly one point. Call sites that
  mirror, invalidate, or schedule frames ad hoc are non-conformant;
  removing any one call site's hand-rolled plumbing must not change
  observable behavior.
- **FRAME-3** Narrow fidelity: reflecting property-only damage
  through the narrow path yields the same renderer scene — and the
  same pixels — as a wholesale reload of the same working copy.
- **FRAME-4** Quiescence: reflecting an empty ledger schedules
  nothing — no renderer frame, no host redraw request. A host loop
  that reflects on every event does not busy-paint an idle document.
- **FRAME-5** Ledger completeness: every applied batch accrues into
  the ledger regardless of origin and recording mode, and draining
  returns everything accrued since the previous drain, exactly once.
