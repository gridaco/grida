# Transform / Rotation — Feedback for svg-editor

Context dump for the svg-editor agent picking up rotation work. Written
right after the HUD-side `SelectionShape.transformed` contract landed
and svg-editor opted in via `shape_of`. Captures what's done, what's
broken, what's undecided, and what's load-bearing for the next pass.

---

## Background — what changed upstream

The HUD (`@grida/hud` / `packages/grida-canvas-hud/`) now natively
supports rotated/skewed/scaled selections via a new variant on
`SelectionShape`:

```ts
// packages/grida-canvas-hud/event/shape.ts
export type SelectionShape =
  | { kind: "rect"; rect: Rect }
  | {
      kind: "transformed";
      local: Rect; // artwork's untransformed local-frame bbox
      matrix: cmath.Transform; // 2×3 affine, local → doc-space
    }
  | { kind: "line"; p1; p2 }
  | { kind: "unresolved"; id };
```

When a host emits `kind: "transformed"`, the HUD renders **rotated
outline + rotated corner knobs + rotated edge/rotation halos + rotated
size badge + rotation-aware cursors + rotated dashed resize preview**.
No additional opt-in is required HUD-side — every chrome surface
already branches on `kind`.

Resize gesture math: HUD's `applyResize` inverts the matrix's linear
part, rotates the doc-space pointer delta into the local frame, applies
the standard SE/NW/etc. arm to `local.{x,y,width,height}`, and keeps
the matrix. So dragging a corner of a rotated rect extends the artwork
along its rotation axis (NW corner pinned, SE corner moves toward the
cursor). The intent emits both `rect: shapeBounds(shape)` (AABB,
backwards-compat) and `shape: SelectionShape` (full local + matrix).

Rotate gesture math: pivot = center of `shapeBounds(initial_shape)`,
which equals the local-center transformed through `matrix` whenever
`matrix` is pure rotation (the common case). For skew or non-uniform
scale, the pivot is approximate — flagged as a v1 limitation in the
HUD plan, not the host's problem to solve until skew lands.

---

## svg-editor changes already in place

### 1. `shape_of` opts into `transformed`

`packages/grida-svg-editor/src/dom.ts` — the `shape_of(id)` method:

- Returns `{ kind: "rect", rect: container_box(id) }` when CTM is
  identity / pure translate-scale (`b === 0 && c === 0`). Fast path,
  byte-identical to pre-rotation output.
- Returns `{ kind: "transformed", local: getBBox(), matrix }` when
  CTM has rotation or skew. Matrix is `getScreenCTM()` with the
  container's screen offset subtracted from `e`/`f` (mirrors
  `container_box`'s offset math).
- Falls back to `rect` for `<svg>` viewports and elements without
  geometric APIs.

### 2. `is_resizable_node` allows rotated nodes

`packages/grida-svg-editor/src/core/intents.ts` `is_resizable_node`:

Previously refused anything other than `identity` or
`leading_translate_only`. Now also allows `single_rotate` and
`leading_translate_then_single_rotate`. The orchestrator was already
designed to consume `target_width/height` and write attrs in the
element's local frame — the gate was the only thing blocking.

### 3. `handle_resize` consumes `intent.shape`

`packages/grida-svg-editor/src/dom.ts` `handle_resize`:

```ts
if (intent.shape && intent.shape.kind === "transformed") {
  target_width = intent.shape.local.width;
  target_height = intent.shape.local.height;
} else {
  const zoom = this.camera.zoom || 1;
  target_width = intent.rect.width / zoom;
  target_height = intent.rect.height / zoom;
}
```

When the gesture is on a transformed shape, `local.width/height` are
already in element-coordinate space (no zoom division). For axis-aligned
selections, the legacy `rect.width/zoom` path is unchanged.

### 4. Size meter reads `local` and tilts the pill

`packages/grida-svg-editor/src/dom.ts` `compute_size_meter_extra`:

For single-selection `transformed` shapes, emits the badge with:

- text = `local.width × local.height` (artwork's true dims)
- anchor = `matrix · (local bottom midpoint)` in container space
- `labelAngle = angle(matrix) × π / 180` so the pill tilts with the
  artwork

Multi-selection and `rect`-kind paths unchanged.

---

## What works end-to-end right now

Manually verified in the browser (`/svg`) by applying
`transform="rotate(30 90 110)"` to a `<rect>` and re-selecting:

- [x] Selection outline rotates (4-corner polyline through `matrix`)
- [x] Corner knobs rotate (`HUDScreenRect.angle = screen_angle_rad`)
- [x] Size badge reads artwork dims (60×60 for a rotated 60×60 rect,
      not 81.96×81.96 which is the AABB-of-rotated)
- [x] Size badge pill rotates with the selection
- [x] Resize cursor on a corner knob tilts with the selection
- [x] Rotate cursor at idle and through-gesture is correctly oriented
- [x] Dashed resize-preview is a rotated 4-corner polygon (matches the
      rotated artwork being dragged), not an AABB

---

## What's fixed

### ✅ FIXED — rotate pivot drift on resize

`apply_resize` now calls `renormalize_rotate_pivot` after each primitive
arm's geometry write. Gate: classification ∈ {`single_rotate_only`,
`leading_translate_then_single_rotate`} AND `rotate.explicit_pivot ===
true`. User-authored `rotate(θ)` (1-arg) is refused at `is_resizable_node`;
re-emit would canonicalize to 3-arg form and violate P1. Resize becomes
a silent no-op on those; rotate still works. Wired for `rect`, `image`,
`use`, `circle`, `ellipse`, `line`, `polyline`, `polygon`, `path`. Text
deferred. Bonus: fixed the `"single_rotate"` vs `"single_rotate_only"`
typo at `intents.ts:800` that silently refused every fresh rotation.

### ✅ CONFIRMED CORRECT — rotate-pipeline composition with existing rotation

`capture_rotate_baseline` reads existing `rotate.angle` into
`current_rotation_deg`; `apply_rotate` writes `current + delta`. Pinned
by `rotate-intent.test.ts` "accumulates onto a pre-existing rotation".
Related: `apply_rotate` now always emits the 3-arg form so the result
parses back as `explicit_pivot: true` (the resize gate requires it).

### 🟡 LIKELY BROKEN — snap on rotated elements

The snap pipeline (`packages/grida-svg-editor/src/core/snap/`) computes
guides against world-space AABBs. For a rotated rect, snap targets are
the AABB corners/edges — which don't align with what the user is
visually dragging.

**Test scenario**: rotate a rect 30°, then drag it past another
axis-aligned rect. Does the snap guide highlight the rotated edge or
the AABB edge? If AABB, the user sees a snap guide that doesn't match
the artwork's visible edge. The snap may also "stick" the rotated rect
to positions that don't visually align.

This is out of scope for the rotation work proper but worth knowing
about before claiming "rotation is supported."

### 🟡 RESIZE ANCHOR EXPECTATION FOR ROTATED RECT (unverified)

The HUD's `applyResize` for `transformed` shapes does:

- SE drag → local.width/height grow, local.x/y unchanged → NW corner
  pinned in doc space, SE corner moves toward the rotated SE
- NW drag → local.x decreases, local.width grows → SE corner pinned,
  NW corner moves toward the rotated NW
- ... etc.

For axis-aligned rects this matches user expectation (opposite corner
anchors). For rotated rects this same rule means **"the rotated
opposite corner pins."** This is what Figma does. Verify it matches
your expectation before locking in.

---

## What's not decided

### 1. Should resize on a rotated element re-normalize the rotate pivot?

**Yes** is the natural answer (the pivot is conceptually "the
rotation point of the artwork", and after resize the geometric center
moved). But the fix has nuance:

- For `rotate(θ cx cy)` form: easy, recompute (cx, cy) = new center.
- For `translate(tx ty) rotate(θ)` form: the rotation is around the
  local origin; resize doesn't shift it. Different math.
- For a transform that's been classified as
  `leading_translate_then_single_rotate`: which one moves?

Picking the rule is a host serialization decision, and the host owns
the transform attribute, so the host picks.

### 2. Should `<g>` children participate in `transformed`?

Currently `shape_of` uses `getScreenCTM()` which includes ancestor
transforms. A `<rect>` inside a rotated `<g>` will emit a `transformed`
shape with the composed matrix.

**But**: resize on that rect via `apply_resize` writes the rect's own
`width`/`height` in its own local frame — which doesn't know about
the `<g>` rotation. The HUD emits `intent.shape.local` in the rect's
local frame (post-getBBox), which IS the right frame. So the resize
math is correct IFF `intent.shape.local` is consumed (which it is).

But the resize gate `is_resizable_node` checks the element's OWN
transform attribute, not its ancestors'. A rect with no transform
inside a rotated `<g>` will pass the gate (correctly) but the
visualization will rotate with the group. Verify this works end-to-end
and doesn't have surprising side effects.

### 3. Multi-selection with mixed rotations

The HUD renders one chrome envelope per `SelectionGroup`. For a
multi-selection where members have different rotations, the host
currently sends a flat `setSelection(ids)` and the HUD resolves each
member's shape individually — N independent chromes. This is the
honest answer; no unified bbox lie.

But there's no resize semantics defined for "drag the SE corner of a
group with members at different rotations." Currently each member's
own gesture starts independently from its own knob. If the user wants
a unified group-resize, the host would need to compute a synthesized
group baseline and emit it as a single `transformed` shape — but
"what's the matrix of a multi-member group?" is undefined.

**Recommendation**: punt. Multi-selection with rotated members shows
N independent chromes; resize/rotate are per-member. Document and ship.

### 4. Knob `respectParentTransform` opt-out

The HUD's design discussion settled on "knobs respect parent transform
by default; can be customized per-knob via a property like
`escapeParentTransform`." The HUD currently has the default behavior
hard-wired (knobs always rotate). No opt-out property yet.

**Question**: do we need the opt-out? If yes, what's the use case?
The discussion mentioned "screen-aligned knobs are sometimes preferred
for legibility at extreme rotations." Defer until a real use case
surfaces.

### 5. Camera transform composition

The HUD's `setTransform` is the camera (doc → screen). svg-editor
sets it to identity and applies the camera as a CSS `transform=` on
the SVG root instead (see `apply_camera_transform`).

`shape_of`'s matrix is computed from `getScreenCTM()` minus container
offset — which already includes the SVG's CSS camera transform. So
the matrix is `(camera × local-to-doc)`, not `local-to-doc`. The HUD
then composes its own (identity) camera with this matrix in
`pushTransformedChrome`, producing `identity × (camera × local-to-doc) = camera × local-to-doc`
— correct, but only because the HUD's camera is identity.

**If the HUD's camera ever becomes non-identity for svg-editor, this
breaks.** The matrix coming out of `shape_of` would be applied AGAIN
by the HUD camera, double-transforming the chrome.

The clean fix: `shape_of` should emit `matrix` in DOC space (not
camera-applied screen space), and let the HUD camera compose. That
requires reading getCTM() instead of getScreenCTM(), and recomputing
the container-offset correction.

Currently this works only because svg-editor pins HUD camera at identity.
**Document the assumption or fix the math.**

---

## What's flawed structurally

### 1. Two parallel paths for resize: gesture vs headless command

`commands.resize_to` (headless RPC) computes its own targets via
`geometry_provider.bounds_of(id)` (world AABB) and doesn't see the
HUD's `intent.shape`. For rotated rects, this means the headless
command's behavior diverges from the gesture: the headless one
operates on the AABB, the gesture operates on the local frame.

Either:

- The headless command should also receive an optional `shape`
  parameter for callers that want local-frame resize, or
- Document that the headless command is for axis-aligned-only resize
  and the gesture path is the source of truth for rotated.

### 2. `RotateBaseline` parse-classify dance

`packages/grida-svg-editor/src/core/intents.ts:661` parses the
existing `transform=` into a classified op list. There are 4 classes
the rotate pipeline accepts; `set_property` and `set_attr` paths that
write arbitrary `transform` strings could violate the classifier's
assumptions and cause the next rotate gesture to refuse the element.

When this codebase opens up to general transform writes (e.g. via the
inspector's transform field), the rotate pipeline will refuse those
elements until they're re-classifiable. That's a UX cliff. Worth
considering before exposing arbitrary transform editing.

### 3. Dead code from the revert/re-wire dance

When the rotation work was scoped down then re-enabled, two `transformed`
branches in `handle_resize` and `compute_size_meter_extra` were left
in place across the revert. They're now live again. Audit them:

- `dom.ts:handle_resize` — the `intent.shape?.kind === "transformed"`
  branch
- `dom.ts:compute_size_meter_extra` — the `shape.kind === "transformed"`
  branch

Confirm they still produce the right output. They were tested when
first written but the surrounding code may have shifted.

---

## Test gaps

The HUD package has full unit coverage of the new `transformed` paths
(146 tests, including `chrome-transformed.test.ts` with 16 cases).
**svg-editor has zero tests for the rotation opt-in.** Recommended new
tests:

- `dom.test.ts` — `shape_of` returns `transformed` for a `<rect transform="rotate(30 50 50)">`
  with correct `matrix` and `local`.
- `dom.test.ts` — `shape_of` returns `rect` (fast path) for an
  un-transformed rect.
- `dom.test.ts` — `shape_of` returns `rect` (fast path) for
  `transform="translate(10 20)"` (b/c are 0).
- `intents.test.ts` — `is_resizable_node` returns true for a
  `single_rotate` node, false for a `single_scale` node (gating
  consistency).
- e2e gesture test — drag a resize handle on a rotated rect, assert
  width attribute changes (and pivot stays put, unless pivot
  normalization is implemented).
- e2e gesture test — rotate an already-rotated rect, assert angle
  composes correctly (not 0 + delta).
- Snap behavior test — drop a rotated rect near an axis-aligned rect,
  document the actual snap behavior so the team can decide if it
  needs to change.

---

## Files to read first

If picking this up cold:

1. `packages/grida-canvas-hud/README.md` — HUD architecture, the
   render/hit-test split, and the OverlayElement contract.
2. `packages/grida-canvas-hud/event/shape.ts` — `SelectionShape`
   union, the `transformed` variant.
3. `packages/grida-canvas-hud/event/gesture.ts` —
   `SurfaceGestureResize` with `initial_shape`/`current_shape` and
   `applyResize` for the transformed arm (the local-frame delta math).
4. `packages/grida-canvas-hud/surface/chrome.ts` —
   `pushTransformedChrome` (the 9-slice in shadow space + rotate
   zones around screen center).
5. `packages/grida-svg-editor/src/dom.ts` — `shape_of`, `handle_resize`,
   `compute_size_meter_extra`.
6. `packages/grida-svg-editor/src/core/intents.ts` — `is_resizable_node`,
   `apply_resize`, `parse_transform_list`, `classify`, and
   `RotateBaseline`.
7. `packages/grida-svg-editor/src/core/rotate-pipeline/` — the rotate
   gesture orchestrator + apply logic. Verify composition with existing
   rotation.

---

## Summary for the agent

You've inherited a working but incomplete rotation feature. The HUD
side is complete and pixel-correct for the v1 surface (no exact-OBB
hit-test, but everything else is wired). svg-editor opted in. The
visible chrome rotates faithfully.

**What's missing on the svg-editor side**:

1. **Rotate pivot normalization on resize commit** (blocker for
   sequential rotate/resize cycles)
2. **Verify rotate gesture composes with existing rotation, not
   resets** (likely silently broken)
3. **Verify snap on rotated elements** (likely visually wrong)
4. **Tests for `shape_of` and `is_resizable_node` on rotated nodes**
5. **Audit headless `commands.resize_to` vs gesture `intent.shape`
   divergence**
6. **Audit dead code in `handle_resize` and `compute_size_meter_extra`**

Do not modify HUD-side code without coordinating — the contract is
locked and pixel-tested. All host work should land in svg-editor and
flow through the existing `shape_of` / `intent.shape` boundaries.
