# svg-canvas spike — FINDINGS (consumer feedback to the SDKs)

First-consumer feedback from building an **infinite-canvas-of-SVGs** host on top
of `@grida/svg-editor` + `dotcanvas` (issue #886). Started as a throwaway spike;
now lives as the `/svg/examples/board` demo (sibling of `slides`).

**Framing:** _"it would have been much better if `<SDK>` did `<Y>`."_ We are the
spike/consumer — we list **every** idea, wish, and friction we hit, generously
and without filtering. We deliberately **do not triage** feasibility, layer,
ownership, or whether it's already-by-design — that's the maintainer's job. Some
wishes are big, some may be wrong-layer or already exist; surfacing beats
self-censoring. Detail is intentionally light.

Code: `editor/app/(canvas)/svg/examples/board/` (`_core/svg-canvas.ts` + `_core/svg-geometry.ts` + `_components/` + `_fixture/`). Route: `/svg/examples/board`.
Architecture: a transformed world layer renders N SVGs as `<img data:>`; the one
_active_ frame becomes a live `@grida/svg-editor`.

---

## Rung D — the make-or-break: VERDICT (cross-frame element select + drag)

**The probe:** select elements that live in DIFFERENT single-document frames and
drag them together. The `/pedantic` panel called it _structurally barred_ — each
editor's picking is surface-private and its HUD clips at the frame edge.

**Result: pragmatically achievable from a host layer ABOVE the editors — for the
select + move-together case — but ONLY by the host reimplementing the editor's
private picking.** The panel was right about the _editor API_ and wrong about the
_ceiling_: a host can synthesize all three pieces without any new editor surface:

- **Picking** — frames are inert `<img data:>` (no queryable DOM), so the host
  parses each SVG into a bbox model and hit-tests in pure math
  (`_core/svg-geometry.ts`). This **keeps the `<img>` isolation win** (no inline
  SVG, no id/CSS collisions) AND gets cross-frame picking. The catch: it is a
  **toy** — axis-aligned bbox, approximate text metrics, crude `path`/`points`
  extents, ignores nested transforms & filters. Fine for shapes; not production.
- **Chrome** — a single host overlay draws per-element boxes + a unified bounds
  box that **spans frames and lives outside any per-frame clip**. Clean, because
  it's just screen-space projection (same machinery as frame chrome).
- **Drag** — each element translates within ITS OWN sovereign document (transform
  injection); a cross-frame move = N independent doc edits folded into **ONE**
  unified-history step. **The layer split holds** — no element ever leaves its
  document, no live editor is mounted in the inactive frames.

**So: the concept is pragmatic, the layer-split survives the hardest rung, and
"fundamentally impossible" was too strong.** What's genuinely _not_ host-doable is
**fidelity**: you cannot match the editor's exact hit-testing, text shaping, and
path geometry from outside — which is exactly what makes **SE8** (editor exposes
picking against an un-mounted doc) and **SE9 / HUD1** (host-level multi-doc HUD)
the items that would turn this from a convincing toy into production-grade. The
alternative we did NOT take — render inactive frames as inline SVG / shadow DOM to
borrow the browser's `getBBox`/`getScreenCTM` — buys real geometry at the cost of
the `<img>` isolation win; a real host would weigh that trade per-product.

Built + unit-tested (geometry parse/pick/translate, cross-frame select, drag =
one history step, undo reverts all frames). Cmd/Ctrl+Shift+click picks across
frames; Cmd/Ctrl+Shift+drag moves them as one.

---

## `@grida/svg-editor` — it would've been much better if…

- **SE1 — …the editor could live inside a host that scales/transforms it.**
  ⚑ _bug-grade (see "Upstream bug candidates" below)._ Its HUD chrome
  double-scales when an ancestor has a CSS transform: the projection is
  transform-aware (`getScreenCTM`) but the HUD canvas is a transformed _child_
  of the container (`container.appendChild(hud_canvas)`), so the scale applies
  twice. We worked around it (mount in a separate 1:1 screen-space overlay +
  mirror zoom onto its own camera), but "drop me into your transformed scene at
  zoom Z" would make embedding trivial — and the transform-aware projection
  suggests it's _meant_ to compose, just incompletely.

- **SE2 — …there were a first-class "I'm one frame in a bigger canvas" mode.**
  Host owns the world camera; the editor is a placed node. `gestures:false` +
  manual camera is the closest path and it works, but it's discovered, not
  blessed.

- **SE3 — ~~it didn't scroll its container on selection~~ — WITHDRAWN after
  source check.** Suspected the editor scrolled its container on selection.
  Wrong: it never calls `scrollIntoView`, and it actively _compensates_ for a
  scrolled container (`+container.scrollTop/Left` in every projection) — it's
  robust to scroll (now under Validated wins). Our content-shift was native
  scroll on OUR overflowing container (the editor sizes the svg layout box to
  viewBox px, which overflows a smaller frame). Host-side artifact, fixed with a
  scroll-pin. Not an editor issue.

- **SE4 — …its history were observable / portable.** If the editor emitted
  history-step events or let a host inspect/inject its undo stack, the host could
  fold per-document edits into ONE fine-grained, cross-document timeline. Today
  we can only get _session_-granularity unification — fine-grained undo across
  documents is impossible because the editor's history dies with the instance.

- **SE5 — …an editor instance (and its fine history) could be kept warm /
  detached when it's not the active frame.** Then undo→cross-out→redo would
  restore the in-svg edits instead of losing them on dispose.

- **SE6 — …there were a cheap "interactive preview" tier between inert `<img>`
  and a full live editor.** We swap hard between a dead image and a full mount;
  a promote-on-demand middle tier would smooth activation (less flash, history
  continuity).

- **SE7 — …the camera were a shareable primitive.** Host and editor each
  implement `{zoom, pan, screen↔world}`; we hand-rolled ours. Sharing one would
  also guarantee they can't drift.

- **SE8 — …hit-testing/picking worked against an un-mounted document.**
  ⚑ _Now load-bearing — this is the gate on Rung D's fidelity (see VERDICT)._
  For cross-frame selection we hit-test into _inactive_ frames without mounting
  an editor in each. Picking is surface-private today, so we built a TOY geometry
  engine (`_core/svg-geometry.ts`) that re-parses the SVG ourselves — it works for
  shapes but can't match the editor's real hit-testing (paths, text, transforms,
  filters). An editor API like `editor.hitTest(svg, point)` / `bbox(svg, id)`
  against an un-mounted document would let a host pick at full fidelity while
  keeping the `<img>` isolation win.

- **SE9 — …the HUD/selection chrome could render in a host overlay that spans
  multiple documents (and outside a single document's clip).** ⚑ _Validated in
  Rung D — we built exactly this host overlay and it works._ Selection handles in
  the _editor_ still clip at the frame edge; we sidestepped that by drawing the
  cross-frame chrome ourselves at the host level. A blessed host-overlay HUD (with
  real handles/transform widgets, not just boxes) would make it production-grade.

- **SE10 — …gesture/zoom-sensitivity constants were exported (or a "match my
  feel" config existed).** We copied `1 - deltaY*0.01` by reading the editor's
  source so the canvas pan/zoom feels the same.

- **SE11 — …interaction intents were observable.** A host wiring its own
  double-click-to-edit / enter-exit had to detect double-click manually; an
  observable "user wants to edit this" intent (or a documented host-drives-
  activation path) would compose better.

- **SE12 — …there were a blessed "many editors on one surface, one active"
  composition recipe in the README.** The next consumer will otherwise
  rediscover the whole stack we did: `gestures:false` + own-camera-at-host-zoom +
  screen-space mount + scroll-pin.

## `dotcanvas` — it would've been much better if…

- **DC1 — …there were a registered `svg-canvas` type** (SVG-only infinite-canvas
  profile) so a host could dispatch on it and rely on "every document is editable
  by one editor," instead of authoring it and getting `unknown`.

- **DC2 — …it helped with the canvas-view projection.** Placement for
  layout-less documents (#887) and canvas-level view metadata (camera / grid /
  background, #888) as blessed fields rather than the vendor `ext` bag.

- **DC3 — …there were a ready browser/in-memory directory adapter.** We
  hand-built an in-memory `ReadableFs`; minor (it worked cleanly), but a shipped
  one would save every browser consumer the boilerplate.

## `@grida/hud` — it would've been much better if…

- **HUD1 — …there were a host-level HUD/marquee that spans multiple documents.**
  The current HUD is single-node-transform focused; a multi-frame selection
  overlay is the missing piece for cross-frame editing.

## `@grida/cmath`

- No wishes — it had the rect/transform/clamp math we needed. (We chose to
  hand-roll minimal versions only to keep the spike core dependency-free; that's
  our call, not a gap.)

---

## Validated wins — the SDKs got these right (worth keeping)

- **svg-editor composes at all** with `gestures:false`; once mounted at 1:1, its
  `getScreenCTM` HUD projection correctly folds ancestor transforms.
- **`serialize()` round-trips byte-clean**, and an opened-but-unedited document
  produces no diff — that guarantee made "no spurious history step" free.
- **`state.can_undo` / `commands.undo`** were enough to build the boundary-
  crossing undo (walk fine history, then cross to the canvas).
- **dotcanvas reads in-browser** over an in-memory fs, and the tolerant reader
  degraded our unknown `svg-canvas` type gracefully (authoring it early "just
  worked").
- **`<img data:>` per-document isolation** — each SVG its own context, zero
  cross-frame id/CSS collision.
- **The editor is robust to a scrolled container** — it adds
  `container.scrollTop/scrollLeft` in every coordinate projection, so chrome
  stays aligned even when the container scrolls (this is why SE3 was withdrawn).

---

## Upstream bug candidates — file independently of our goal

The honest filter (the user's question): of all the wishes above, which are
**universal correctness/stability bugs** a maintainer would treat as bugs,
versus **feature wishes** scoped to our infinite-canvas composition? After
source-checking, very few:

- **SE1 — HUD chrome double-scales under a CSS-transformed ancestor.**
  _Bug-grade, file-worthy._ Mechanism confirmed in source: transform-aware
  projection (`getScreenCTM`) + transform-naive render target (HUD canvas is a
  child of the container). Affects any consumer who CSS-`transform: scale()`s an
  ancestor of the editor (zoom UIs, scaled previews) — not just us. Niche but a
  real latent correctness gap; maintainer may still call "mount at 1:1" the
  contract. File as a precise robustness report, let them decide bug vs by-design.

- **`fit` mis-computed zoom (≈0.016 instead of ≈0.66)** — RESOLVED, not a bug.
  Root cause: `camera.fit` uses `DEFAULT_FIT_MARGIN = 64` px per side; our
  active-frame container was the content's screen size (~210×131), so usable
  height = `131 − 2·64 = 3px` → `zoom = 3/200 ≈ 0.015`. Expected for a container
  smaller than the margin; fix is `fit(target, { margin: 0 })`. We'd already
  switched to an explicit `set_transform` (the correct call for an exact-fit
  container). Not filed. _(Theoretical nit, unconfirmed + not filed: `fit`
  doesn't appear to clamp when `2·margin ≥ viewport`, which could yield a
  degenerate zoom for very small viewports — but we only observed the expected
  positive-tiny case.)_

Everything else (SE2, SE4–SE12, DC\*, HUD1) is a **feature wish for composing the
editor into a host canvas** — legitimate input, but not a bug and not
independent of our goal. Don't file as bugs.

---

## Spike's own next steps (our work, not SDK feedback)

- ~~Rung D — cmd+shift select elements across frames + drag (the make-or-break).~~
  **DONE** — see VERDICT above. Host-synthesized via a toy geometry engine; the
  layer-split survived. Toy-engine fidelity is the only ceiling (→ SE8).
- Rung B — drag-to-reorder z (`layout.z`); nest-svg-into-svg is the `<use>` trap, won't build.
- Frame snapping while moving (host build; the editor's snap is internal+single-doc).
- Element-drag fidelity probes left as toy: rotated/transformed elements, text
  picking precision, `<g>` group selection. Enough to answer "is it pragmatic"; not enough to ship.
- Remove the `window.__svgCanvas` / `__activeEditor` dev aids before anything real.

## Non-goals (settled)

- svg-editor stays single-document; the host composes it — never N live editors.
- `<use>` / nested-`<svg>` as the canvas container is a trap (container-vs-content);
  valid only as an export/flatten target.
