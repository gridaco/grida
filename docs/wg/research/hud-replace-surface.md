# HUD Replace Surface — Tracking Doc

**Branch:** `feat/hud-replace-surface`
**Plan:** big-bang replacement of `editor/grida-canvas-react/viewport/surface.tsx` (2,296 lines) with `@grida/hud`-based surface + carve-out DOM layer.
**Status:** Phase 0 (snapshot baseline established).

This document tracks the migration. Two living tables:

1. **Pre-refactor reachable surface actions** — snapshot below; Phase 9 diffs against it to detect dead actions.
2. **Delta log** — per-phase notes on what changed, what regressed, what was deferred.

---

## Pre-refactor reachable surface actions (snapshot)

Generated from grep of `editor/grida-canvas-react/viewport/**` for `editor.*` callsites. 100 unique methods grouped by namespace.

### `editor.camera` (7)

- `zoom(delta, origin)` — wheel zoom
- `pan(dx, dy)` — space/middle-mouse drag
- `zoomIn()`, `zoomOut()` — keyboard
- `scale(value, origin)` — reset zoom
- `fit(target, opts)` — fit selection / scene
- `clientPointToCanvasPoint(coords)` — used by `surface-text-editor.tsx`

### `editor.surface` — pointer/gesture (15)

- `surfacePointerMove`, `surfacePointerDown`, `surfacePointerUp`
- `surfaceClick`, `surfaceDoubleClick`
- `surfaceDragStart`, `surfaceDrag`, `surfaceDragEnd`
- `onblur`
- `surfaceHoverEnterNode`, `surfaceHoverLeaveNode`
- `surfaceMultipleSelectionOverlayClick`
- `surfacePickColor` (eyedropper, Shift+C — `hotkeys.tsx`)
- `explicitlyOverrideInputUndoRedo` (text input interception)

### `editor.surface` — gesture initiators (6)

- `surfaceStartScaleGesture(ids, dir)`
- `surfaceStartRotateGesture(id)`
- `surfaceStartCornerRadiusGesture(id, anchor, alt)`
- `surfaceStartGapGesture(ids, axis)`
- `surfaceStartPaddingGesture(id, edge)`
- `surfaceStartSortGesture(selection, hover)`

### `editor.surface` — tool / modifier configuration (16)

- `surfaceSetTool(config, label?)`
- `surfaceConfigureTranslateWithForceDisableSnap(on|off)`
- `surfaceConfigureScaleWithForceDisableSnap(on|off)`
- `surfaceConfigureMeasurement(on|off)`
- `surfaceConfigureTranslateWithCloneModifier(on|off)`
- `surfaceConfigureTransformWithCenterOriginModifier(on|off)`
- `surfaceConfigurePaddingWithMirroringModifier(on|off)`
- `surfaceConfigureTranslateWithAxisLockModifier(on|off)`
- `surfaceConfigureTransformWithPreserveAspectRatioModifier(on|off)`
- `surfaceConfigureRotateWithQuantizeModifier(val|"off")`
- `surfaceConfigureCurveTangentMirroringModifier(on|off)`
- `surfaceConfigureSurfaceRaycastTargeting(config)`
- `surfaceConfigurePathKeepProjectingModifier(on|off)`
- `surfaceConfigureRuler(on|off)`

### `editor.surface` — display toggles (4)

- `surfaceToggleRuler`, `surfaceTogglePixelGrid`
- `surfaceToggleOutlineMode`, `surfaceTogglePixelPreview`

### `editor.surface` — content edit (4)

- `surfaceTryToggleContentEditMode`
- `surfaceTryExitContentEditMode`
- `autoSizeTextNode(id, dim)`
- `surfaceSelectGradientStop(id, idx, opts)`

### `editor.surface` — a11y / property quick-edits (24)

Text formatting: `a11yToggleBold/Italic/Underline/LineThrough`, `a11yTextAlign`, `a11yChangeTextFontSize/Weight/LineHeight/LetterSpacing`.
Fill/stroke: `a11yClearFill`, `a11yClearStroke`, `a11ySwapFillAndStroke`.
Other: `a11ySetOpacity`, `a11yNudgeResize`, `a11yAlign`, `a11yEscape`, `a11yToggleActive`, `a11yToggleLocked`, `a11yDelete`, `a11yCut`, `a11yCopy`, `a11yCopyAsImage`, `order(dir)`, `ungroup(target)`.

### `editor.commands` (17)

- `select(ids, mode?)`, `querySelectAll(selector)`
- `undo`, `redo`
- `duplicate`, `flatten`, `group`, `contain`
- `op(selection, op)` — boolean ops (union/difference/intersection/xor)
- `distributeEvenly(target, axis)`, `autoLayout("selection")`
- `changeBrushSize(config)`
- `loadScene(id)`
- `changeNodePropertyText`, `changeNodePropertyFills`, `changeNodePropertyStrokes`
- `getNodeSnapshotById(id)`

### `editor.doc` (4)

- `dispatch(action)` — used by `use-wasm-surface.ts`
- `getNodeById(id)`
- `undo`, `redo` — local text-editor history

### `editor.geometryProvider` / query (3)

- `getNodeAbsoluteBoundingRect(id)`
- `getNodeAbsoluteRotation(id)`
- `resolvePaints(id, target?, idx?)`

### `editor.state` (1)

- `eager_canvas_input(state)` — low-latency gesture feedback

---

## Classification for refactor

**Drop (HUD owns the entry point):** all 15 pointer/gesture handlers, all 6 gesture initiators, `surfaceMultipleSelectionOverlayClick`.

**Drop (state field removed):** `surfaceConfigureTranslateWithForceDisableSnap`, `surfaceConfigureScaleWithForceDisableSnap`, `surfaceConfigureMeasurement`, `surfaceConfigureTranslateWithCloneModifier`, `surfaceConfigureTransformWithCenterOriginModifier`, `surfaceConfigurePaddingWithMirroringModifier`, `surfaceConfigureTranslateWithAxisLockModifier`, `surfaceConfigureTransformWithPreserveAspectRatioModifier`, `surfaceConfigureRotateWithQuantizeModifier`, `surfaceConfigureCurveTangentMirroringModifier`, `surfaceConfigurePathKeepProjectingModifier` — modifiers live in `SurfaceEvent.mods` now.

**Keep (config / DOM):** display toggles (ruler/grid/outline/pixelpreview), `surfaceSetTool`, `surfaceConfigureSurfaceRaycastTargeting` (becomes a `pick` option), `surfaceConfigureRuler`, all `editor.commands.*`, all `editor.doc.*`, all `editor.geometryProvider.*`, all `a11y*` (hotkeys, not surface gestures), `surfaceHoverEnterNode/LeaveNode` (called from hierarchy/title-bar sources still — but `surface.tsx` callsites move to host adapter), `autoSizeTextNode`, `surfaceTryToggle/ExitContentEditMode`, `surfaceSelectGradientStop`, `surfacePickColor`, `explicitlyOverrideInputUndoRedo`, `editor.camera.*`, `editor.state.eager_canvas_input`.

---

## Delta log

### Phase 0 — Branch + snapshot (this commit)

- Created branch `feat/hud-replace-surface`.
- Wrote this tracking doc.
- No code changes.
