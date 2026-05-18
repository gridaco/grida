# FEEDBACKS

First-user feedback on `@grida/tree-view`, captured while dogfooding it into
production. Each entry is real friction or a genuine idea from wiring a live
consumer — not a hypothetical. Keep entries dated and scoped to the consumer
that surfaced them so authors can reproduce.

---

## 2026-05-18 — Consumer #1: `starterkit-slides/slide-list.tsx`

First production wiring. Replaced `@headless-tree/react` in the Keynote-style
slide tray (flat, single-parent reorder, editor-owned selection). It went in
cleanly and the result is less code than the headless-tree version. Friction
and ideas below, ranked by how much they cost a new adopter.

### Blocking-adjacent / highest leverage

**F1 — `getNode()` must return referentially-stable objects, but this is
only documented in a demo file comment.**
The `TreeSource` JSDoc (`src/source.ts`) and README say the source is
"read-only" but never state that `getNode(id)` (and especially `.meta`) must
be the _same reference_ across calls for an unchanged version — otherwise
`useTreeSnapshot` / `useSyncExternalStore` see a store change every render and
can loop. I only found this written down as a buried comment inside
`app/(dev)/ui/components/tree-view/_custom-source.tsx` (`JsonSource`). I had
to build node-identity reuse into the adapter (`_snapshot` reuses the prior
node object when `meta` is `===`).
→ _Suggestion:_ state this contract on the `TreeSource` interface JSDoc and
in a README "adapting an external store" section; consider a dev-only warning
when `getNode` returns a fresh ref while `getVersion()` is unchanged.

**F2 — No first-class "external store" adapter or recipe.**
The package's headline use case is "you own your data" — yet every such
consumer must hand-roll the same boilerplate: a version counter, a listener
set, notify-on-change, and the F1 identity-reuse. That's ~55 lines of
`SlideTreeSource` that will be re-implemented (and subtly diverge) per
consumer. `InMemoryTreeSource` is explicitly _not_ for this.
→ _Suggestion:_ ship a tiny `createExternalTreeSource({ getRoot, getChildren,
getMeta, subscribe })` factory (or at minimum a documented copy-paste recipe)
that encapsulates versioning + identity reuse. This is the single biggest
dogfood friction and will hit every real adopter.

**F3 — DOM/drag wiring is entirely consumer-owned and non-trivial (~80
lines), with the demo as the only reference implementation.**
pointer→threshold→`startDrag`→hit-test→`over()`→`commitDrag` plus window
listener lifecycle and drag-line geometry was reconstructed from the demo
`_panel.tsx`. "DOM-free core" is the right design, but for _the package that
drives Grida's panels_ this glue should be a packaged, tested hook
(`useTreeDrag` / `useTreePointer`) — otherwise every consumer rebuilds the
trickiest, most bug-prone part. `_panel.tsx` is effectively that hook,
un-extracted.
→ _Suggestion:_ promote a hardened `@grida/tree-view/react` drag hook from
the demo; keep the pure core as-is.

### Real friction, worked around

**F4 — `placementFromY` is hard 3-way (before/into/after); a flat /
non-container list wants 2-way.**
Slides aren't containers, so the middle-third "into" is meaningless. I
bypassed the helper and split at 50% manually. Minor, but it's the obvious
helper to reach for and it doesn't fit the (common) flat-list case.
→ _Suggestion:_ a 2-way mode/param, a `splitForNonContainer` helper, or a
documented one-liner for the non-container case.

**F5 — Selection model assumes the package (or a `SelectionAdapter`) owns
selection; an editor that owns it externally fits awkwardly.**
"Selected slide" = "currently-viewed slide", which is editor state. I skipped
`SelectionAdapter` entirely and drove `isViewing` from editor state. As a
consequence the package's keyboard story
(`keyDown`→`dispatch`→`SelectionAdapter`) doesn't apply, so arrow-key
navigation had to be hand-rolled _outside_ the package. The selection design
is built around the package routing selection; "selection lives elsewhere"
isn't a documented first-class path.
→ _Suggestion:_ document the "selection owned by the host" pattern; consider
letting the keymap emit a selection _intent_ (like `rename`/`delete`/
`activate`) so keyboard works without adopting `SelectionAdapter`.

**F6 — `drag` channel emits on every `over()` even when the resolved
position is unchanged.**
A consumer selector on `getDrag()?.getPosition()` (the natural way to drive a
drop indicator) recomputes every `pointermove` frame even when nothing
moved — my drag-line `useLayoutEffect` re-runs each frame during a drag.
(Flagged earlier in an internal review and deferred; as a real consumer it
does bite.)
→ _Suggestion:_ a position-equality guard in `drag.ts`'s `over()` so the
common consumer pattern is cheap by default.

### Minor

**F7 — `commitDrag()` both returns the intent _and_ emits it on the
channel.** Two ways to consume the same event; unclear which is canonical. I
used the channel subscription (matches "the controller is the bus"), but the
return value invites a divergent pattern in other consumers.
→ _Suggestion:_ document the intended consumption model explicitly (channel
vs. return), or have `commitDrag()` return `void` and make the channel the
single path.

### Validated design wins (worth keeping / advertising)

- **`move` intent's `to.index` is already post-removal**, and consecutive
  items step forward — `to.index + i` reproduced the previous hand-rolled
  reorder math _exactly_, deleting code. `resolveDropPosition` earned its
  complexity here.
- **Read-only source + intents** made the editor write-back a literal 3-line
  `controller.subscribe("intent", …)` → `editor.doc.mv`. Clean separation.
- **`TreeProvider` / `useTreeSnapshot`** dropped in with no ceremony; the
  controller lifecycle (`useMemo` + `dispose` on unmount) is obvious.
- Net: fewer lines than the `@headless-tree` version, and the data-flow
  (editor → source → rows → intent → editor) is easier to follow.

### Net verdict (this consumer)

No blocker. Shippable. The cost was almost entirely **F1–F3** (undocumented
source contract + missing external-store adapter + un-packaged drag glue) —
all addressable in the package/docs without API breakage, and all of which
would otherwise be paid again by the next (harder) consumer,
`starterkit-hierarchy`.

---

## Maintainer triage (doctrine defense) — 2026-05-18

Reviewed against the README doctrine first (headless · zero-dep · agnostic ·
you-own-your-data · intents-not-mutations · DOM-free core ·
subscribe-only-to-what-changes) + the `TreeSource`/`TreeController` JSDoc.
Verdicts keyed to the consumer F-IDs above. **ACCEPT-CODE** = package
changes · **ACCEPT-DOC** = doctrine right, contract under-specified ·
**DEFEND** = works as designed · **DEFER** = legit, post-1.0 design.

| F                                         | Verdict                                | Doctrine-grounded rationale                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **F1** getNode stability silent           | **ACCEPT-DOC**                         | The §subscribe-only-to-what-changes perf model _depends_ on this invariant, but `source.ts` only promises "reads + subscribes" — never the consumer's reciprocal duty. Real, load-bearing, under-specified. Add it to `TreeSource.getNode` JSDoc + README §"State ownership". Design correct; contract incomplete.                                                |
| **F2** no external-store adapter          | **DEFEND factory / ACCEPT-DOC recipe** | A `createExternalTreeSource()` must guess version/identity policy the package deliberately refuses to guess (same stance as `applyIntent` declining `copy`). No factory. But the _documented_ canonical pattern is a true gap — add a "Wrapping a live store" README recipe (the `SlideTreeSource` shape). Recipe, not API.                                       |
| **F3** drag glue unowned                  | **DEFEND**                             | §"Drag & drop" + §"Testing doctrine" make DOM-free core a hard line ("anything not expressible as `f(numbers,source)→numbers` belongs in the consumer"). A hook pulls `window`/`getBoundingClientRect`/RAF into the package. `_panel.tsx` is the reference impl — bless it as a recipe (F2 surface), don't absorb it.                                             |
| **F4** `placementFromY` 3-way only        | **ACCEPT-CODE (tiny)**                 | A flat list re-implementing the split in-consumer is exactly what the testing doctrine forbids. Add optional `placementFromY(dy, h, { into:false })` → 50/50 before/after. Pure, unit-testable, no new surface.                                                                                                                                                   |
| **F5** external selection awkward         | **ACCEPT-DOC + DEFER**                 | §"State ownership" makes Selection _Pluggable_ — the correct answer is a ~10-line `SelectionAdapter` over the editor store; then `defaultKeymap` works (bypassing it was self-inflicted). Document that. Keymap-emits-selection-_intent_ for adapter-refusers is a coherent post-1.0 generalization with an open range-resolution-ownership question → **DEFER**. |
| **F6** `over()` emits on no-op            | **ACCEPT-CODE — the one real bug**     | Directly violates §subscribe-only-to-what-changes. `over()`/`setMode` must structurally compare the resolved `DropPosition` and skip `emit()` when unchanged. Pure, in-core, + a `drag.test.ts` case.                                                                                                                                                             |
| **F7** `commitDrag()` returns _and_ emits | **ACCEPT-DOC**                         | Both intentional (return = imperative call sites; channel = the mutations-are-intents doctrine path). Not a bug — declare the **`intent` channel canonical** in JSDoc + README; return is the convenience. Don't make it `void`.                                                                                                                                  |
| wins                                      | **CONFIRM**                            | Validates zero-copy live-view State-ownership, intents-not-mutations write-back, "push the math into the package" (post-removal `to.index`), and the one-provider/one-hook React surface. Doctrine held on every count exercised in-doctrine.                                                                                                                     |

### Action before npm publish

1. **F6** — fix the `over()`/`setMode` emit storm (code + `drag.test.ts`). The
   only genuine bug; it defends the headline perf claim.
2. **F1 + F7** — document the two silent contracts: `getNode` reference
   stability (JSDoc + README); `intent` channel canonical over the
   `commitDrag()` return value (JSDoc + README).
3. **F2 + F5** — add two README recipes: "Wrapping a live store" and
   "External selection adapter (re-enables the keymap)". Absorbs the
   boilerplate + keyboard complaints **with zero new exports**.

Same cycle, nice-to-have: **F4** optional `{ into:false }` on
`placementFromY`.

### Explicit non-goals (defended, not pre-1.0)

- **F3** React drag/pointer hook — violates DOM-free core; recipe, not API.
- **F2** `createExternalTreeSource()` factory — package won't guess store
  version/identity policy; recipe, not factory.
- **F5** `select` added to `TreeIntent` — post-1.0 API decision with an
  unresolved range-resolution ownership question; deferred, not rejected.

> Net: doctrine survived first contact. One real bug (**F6**), two real doc
> gaps (**F1**, **F7**); the rest is documentation the package owed its
> consumers — not API it owes them.

---

## Status — actioned 2026-05-18

All pre-publish items shipped (no API breakage, no new exports):

- **F6** ✅ `drag.ts` `over()` now routes through a `set()` that skips
  `emit()` when the resolved `DropPosition` is structurally unchanged
  (parent/index/placement/over). Regression test added
  (`drag.test.ts` → "over() notifies only when the resolved position
  changes"). Suite **112 green**.
- **F1** ✅ Reference-stability contract documented on the `TreeSource`
  interface + `getNode` JSDoc and the new README recipe.
- **F7** ✅ `commitDrag()` JSDoc + README Drag&drop section declare the
  `intent` channel canonical; the return value is the imperative
  convenience ("pick one path, not both").
- **F2** ✅ README **"Wrapping a live store"** recipe (the canonical
  external `TreeSource` with version + identity reuse). No factory.
- **F5** ✅ README **"External selection adapter"** recipe (10-line
  delegate reusing the shipped `applySelection`; keeps the keymap alive).
- **F4** ✅ `placementFromY(dy, h, { into:false })` 2-way mode; the
  `slide-list` dogfood now consumes it instead of hand-rolling the split.

### F9 — DX: `pnpm test` silently runs the stale `dist/`

Surfaced _while actioning F6_: the F6 test failed with the fix in place.
Cause — `__tests__/*` import from `".."`, which resolves through
`package.json` `exports` to `./dist/`, and there is no vitest `src` alias,
no `exports` `development`/`source` condition, and no `pretest` build. A
contributor editing `src/` and running `pnpm test` (or `vitest`) tests the
**previous build**, green or red for the wrong reason. Cost a real
debugging detour here.
→ **ACCEPT-CODE (tooling).** Add a `vitest.config.ts` `resolve.alias`
mapping the package specifier to `src/index.ts` (or a `"development"`
export condition / a `pretest` `tsdown` run). Test-of-record must exercise
source, not the last build. Cheap, in-doctrine (the testing doctrine
already says the core is the test of record — this makes that literally
true). Recommend before publish alongside F6.
