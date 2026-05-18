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

---

## 2026-05-18 — Consumer #2: `starterkit-hierarchy/` (the layers panel)

The hard consumer the triage predicted. A real nested tree: containers,
expand/collapse, multi-select, rename, drag-reparent — and the editor owns
hierarchy + selection. Replaced `@headless-tree/react` across `tree-node`
(layers), `tree-scene` (scenes), `node-hierarchy-tree-item`, plus the
shared `ui-editor/tree` presentational layer (now library-agnostic) and
deleted `utils.ts`'s `resolveInversedDropInsertionIndex` hack. It went in;
no blocker. One genuinely new finding; the rest confirms prior F-items at
scale.

### New — highest leverage

**F10 — Drag math is not `reverseChildren`-aware; the consumer must
hand-flip `before`/`after`.**
Layer panels are visual-top = last-in-document, so the controller flattens
with `flatten.reverseChildren`. But `flatten` only reverses the _row list_:
`resolveDropPosition` / `DragHandle.over()` resolve the insertion index in
**document order** with no reverse awareness. So for a reversed list the
consumer must invert placement before calling `over()` — pass `"after"`
when the cursor is in the visual top half, `"before"` for the bottom —
or every drop lands mirrored. This is exactly the bug the old headless-tree
consumer hand-patched as `resolveInversedDropInsertionIndex` (now deleted);
the package did not absorb it, it relocated it. It's non-obvious, trivially
reversible-by-accident, undocumented, and it bites _the_ flagship consumer.
The indicator also has to be driven off the pre-flip _visual_ hit while the
move is computed off the post-flip _document_ placement — two coordinate
spaces the consumer must keep straight by hand.
→ _Suggestion:_ thread `reverseChildren` into the controller's drag path
(it already owns the flag for flattening) so `over()`/`commitDrag()`
resolve correctly for the orientation the rows are actually rendered in;
or, at minimum, a documented canonical "reversed list" recipe + a
`resolveDropPosition(..., { reversed })` option so the flip is the
package's math, not the consumer's. This is the F-item most likely to ship
a silent bug in a new adopter.

### Confirmed at scale (prior F-items, harder consumer)

- **F3 + "expand glue"** — pointer→threshold→`startDrag`→hit-test→
  `over()`→`commitDrag` was rebuilt again (~70 lines), now _plus_ a
  manual chevron-click→`controller.toggle(id)` binding that
  `@headless-tree`'s `item.getProps()` bundled for free. Every tree
  consumer re-derives the same gesture glue. Strengthens F3: the
  un-extracted hook should also cover expand/collapse + selection
  gestures, not just drag.
- **F5 confirmed** — selection lives in the editor and the old panel had
  no package keyboard, so the 10-line `SelectionAdapter` recipe doesn't
  apply (it only pays off if you also adopt `defaultKeymap`). Shift-range
  over the flat rows and ⌘/Ctrl-toggle + the range _anchor_ were
  hand-rolled outside the package. "Host owns selection" is the common
  case for an editor and it still falls entirely outside the package's
  selection/keyboard story.
- **Rename edit-mode state is consumer-owned** — as predicted: one
  `renamingId` `useState` replaced `item.isRenaming()/startRenaming()/
abortRenaming()`. ~4 lines, fine — note it so adopters expect to own it.

### Validated wins (worth keeping / advertising)

- **`controller.expandTo(id)` is exactly right.** "Auto-expand ancestors
  of the selection, never auto-collapse the user's manual expansions"
  was ~50 lines of `requiredExpandedItems` + `userExpandedItems` +
  `rebuildTree` bookkeeping in the headless-tree version. It collapsed to
  one additive call. The single biggest deletion of the migration.
- **`to.index` parity held for the hard case.** Nested _and_ reversed:
  once placement was flipped (F10), `editor.commands.mv(items,
to.parent, to.index)` reproduced the old `resolveInversedDropInsertion`
  result exactly — the post-removal document-order index contract is
  robust beyond the flat slide case.
- **Read-only source + intent write-back scaled.** Same 3-line
  `subscribe("intent", …) → editor.commands.mv` shape as Consumer #1,
  unchanged for a genuinely nested editor-owned tree.
- **`ui-editor/tree` decoupled cleanly.** Making the presentational layer
  library-agnostic (props in, no item instance) was mechanical — the
  package never reached into the row components, so there was nothing to
  unpick. Validates "headless · DOM-free core."

### F11 — Snapshot `TreeSource` + a ref-stable host store = silently

stale rows; and `expandTo` throws on not-yet-snapshotted ids.

Two related bites surfaced wiring the editor (canvas/wasm backend):

1. **`expandTo`/`reveal` `getNode()`-throw on a fresh id.** On insert the
   editor selects the new node a tick _before_ the source snapshot
   refreshes. `controller.expandTo(newId)` walks `ancestorsOf` →
   `source.getNode(newId)` → **throws** `unknown node` and takes down the
   panel (the exact crash the user hit). `expandTo` is the natural call
   for "reveal the selection" but it hard-depends on the source already
   knowing the id. Worked around by computing the ancestor chain off the
   host's own parent-LUT and using `controller.expand()` (which never
   touches the source). → _Suggestion:_ `expandTo` should skip ids it
   can't resolve instead of throwing (CodeRabbit #4's stale-id guard
   stopped at focus/`canExpand`; `expandTo`'s `ancestorsOf` path is the
   same class of bug, still unguarded). At minimum document that
   `expandTo` requires the id to be present in the current source
   version.

2. **A snapshot source needs the host's imperative change stream, not
   React state.** The recommended "wrap a live store" recipe bumps a
   version on a React-effect dep. But a wasm/Immer-style host keeps
   `state.document` (and `.nodes`) **referentially stable** — a
   `useEffect([..., nodes, document_ctx])` never re-fires, so the panel
   silently shows stale rows (inserts/deletes invisible until something
   else re-renders). The fix was to drive `source.refresh()` off the
   editor's own `subscribeWithSelector(s => s.document, …)`. → The
   "Wrapping a live store" recipe should explicitly say: refresh from the
   host's subscription, and warn that reference-identity of host state is
   not a reliable change signal (it isn't, for the exact editors this
   package targets).

### Net verdict (this consumer)

Shippable, no blocker (after F11's two workarounds). The migration
_deleted_ net code (esp. expansion bookkeeping) and removed the
`@headless-tree/*` dependency entirely. The
one new, real, ship-a-silent-bug-grade gap is **F10** (reverse-children
drag). Everything else re-confirms F3/F5 at the flagship consumer: the
package's pure core is right, but the un-owned React/gesture glue (drag +
expand + selection) is paid in full by every consumer and is where the
bodies are. Recommend F10 + the F3 hook be the post-publish priority.

---

## Maintainer triage (doctrine defense) — Consumer #2 — 2026-05-19

Reviewed against the README doctrine first (headless · zero-dep · agnostic ·
you-own-your-data · intents-not-mutations · DOM-free core ·
subscribe-only-to-what-changes · selection-pluggable) + the
`TreeSource`/`TreeController`/`resolveDropPosition` JSDoc. Same verdict
taxonomy as the 2026-05-18 triage. **ACCEPT-CODE** = package changes ·
**ACCEPT-DOC** = doctrine right, contract under-specified · **DEFEND** =
works as designed · **DEFER** = legit, post-1.0 design.

| F                                                    | Verdict                                | Doctrine-grounded rationale                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **F10** drag math not `reverseChildren`-aware        | **ACCEPT-CODE + ACCEPT-DOC**           | `reverseChildren` is already a `FlattenOptions` flag the **controller owns** (`TreeControllerOptions.flatten`), and the reverse is pure `f(numbers,source)→numbers` math — squarely in-core by the testing doctrine ("anything expressible as `f(numbers,source)→numbers` belongs in the package"). The package reversing the row list but not the drop index it resolves _for that same list_ is an internal inconsistency, not a consumer concern: it forces the consumer to hand-flip placement and juggle visual-vs-document coordinate spaces — re-importing the exact `resolveInversedDropInsertionIndex` hack the migration deleted. This is _not_ the F3 DOM-glue line (no `window`/RAF). Code: thread the controller's `flatten.reverseChildren` into its `over()`/`commitDrag()` path so the resolved `DropPosition` matches the rendered orientation, and add a `resolveDropPosition(..., { reversed })` option + `drag.test.ts` reversed cases. Doc: a "reversed list" note so the contract is explicit.                                                                                                                                                                                                                                                                     |
| **F11.1** `expandTo`/`reveal` `getNode()`-throw      | **ACCEPT-CODE**                        | Same stale-id class as CodeRabbit #4. The controller already concedes (`_peek` JSDoc, `controller.ts`) that "the source is external and may drop the node the controller still holds" and degrades focus/`canExpand` to a no-op via `_peek`. But CodeRabbit #4's guard _deliberately stopped at focus/`canExpand`_ — `expandTo`'s `ancestorsOf` path (`source.ts` `ancestorsOf` → unguarded `source.getNode(cursor).parent`) was left to throw. `reveal()` is the JSDoc-blessed "reveal the selection" entry point, so an id selected one tick before the snapshot refreshes is a _foreseeable_ race, not consumer misuse — and an uncaught throw that takes down the panel contradicts the controller's own stale-id-tolerance intent. In-core, pure, no new surface: `expandTo` must skip ancestors it can't resolve (mirror `_peek`'s try/`continue`, the same shape `subtreeMembership` already uses for stale anchors). Add a `controller.test.ts` case.                                                                                                                                                                                                                                                                                                                            |
| **F11.2** snapshot source vs. host imperative stream | **ACCEPT-DOC + DEFEND**                | The "you own your data" tenet is explicit that the version/identity _and_ change-detection policy is the consumer's — there is "intentionally **no `createExternalSource()` factory**" because "only you know your store's change semantics" (README; same stance as `applyIntent` declining `copy`, prior **F2 DEFEND**). A packaged refresh hook would have to know the host emits via `subscribeWithSelector` rather than React-state identity — exactly the store-specific knowledge the doctrine refuses, and it would drag a React effect into the DOM-free core (prior **F3** line). So no API: **DEFEND**. But the _recipe_ actively misleads — it bumps version on a React-effect dep, and the editors this package targets (wasm/Immer) keep `state.document`/`.nodes` referentially stable, so that effect never re-fires and rows go silently stale. That is a real doc defect in the canonical pattern: **ACCEPT-DOC** — the "Wrapping a live store" recipe must drive `refresh()` from the host's own imperative subscription and explicitly warn that host-state reference identity is _not_ a reliable change signal for the exact editors this package targets. Doctrine right; recipe wrong.                                                                           |
| **re-confirmations** F3-glue / F5 / rename-state     | **DEFEND (F3, F5) + CONFIRM (rename)** | Nothing in the flagship consumer changes the prior verdicts; it _reinforces_ them. **F3** (now also expand/collapse + selection _gesture_ glue, ~70 lines + chevron→`toggle`): still the DOM-free-core hard line — a hook bundling gesture glue pulls pointer/`getBoundingClientRect`/RAF into the package; `_panel.tsx`/`tree-node` is the reference recipe (F2 surface), bless it, don't absorb it. Re-confirmed at scale = stronger case for a _documented hardened recipe covering drag+expand+selection gestures_, **not** for crossing the line. **F5** ("host owns selection" is the common editor case, the 10-line `SelectionAdapter` recipe only pays if you also adopt `defaultKeymap`): the §State-ownership table makes Selection _Pluggable_, and the prior **DEFER** on a keymap-emitted selection _intent_ stands — the flagship consumer not adopting `defaultKeymap` is the documented bypass cost, not a new gap; range-resolution-ownership is still the open post-1.0 question. **Rename edit-mode state**: §State-ownership explicitly assigns "Rename, hover, scroll" to the **Consumer** ("out of scope; the controller emits `intent` only") — the one `renamingId` `useState` is the doctrine working as designed; **CONFIRM**, just document the expectation. |

### Action before npm publish

1. **F10** — thread the controller-owned `flatten.reverseChildren` into the
   drag path so `over()`/`commitDrag()` resolve the drop index in the
   orientation the rows are _rendered_ in; add a
   `resolveDropPosition(..., { reversed })` option for advanced direct
   wiring + `drag.test.ts` reversed before/after/into cases. The one new
   ship-a-silent-bug-grade gap; it defends the "push the math into the
   package" / `to.index`-parity doctrine the wins section credits.
2. **F11.1** — make `expandTo` skip ancestors it cannot resolve instead of
   throwing (same try/`continue` shape as `_peek` and `subtreeMembership`'s
   stale-anchor guard). This is precisely the residue CodeRabbit #4's
   stale-id guard left behind: that guard covered focus/`canExpand` via
   `_peek` but the per-emit selection prune _and_ the `ancestorsOf` path in
   `expandTo`/`reveal` were intentionally skipped — finish the same class
   here. Add a `controller.test.ts` regression (select-then-reveal before
   the snapshot refreshes).
3. **F10 + F11.2 (docs)** — document two contracts the package owed its
   consumers: the reversed-list drag orientation (now backed by code), and
   correct the **"Wrapping a live store"** recipe to refresh from the
   host's _imperative_ subscription with an explicit warning that host-state
   reference identity is not a reliable change signal (the wasm/Immer case).

No new exports beyond F10's optional `{ reversed }` arg (an additive
option on an already-exported function, mirroring F4's `{ into:false }`).

### Explicit non-goals (defended, not pre-1.0)

- **F11.2** packaged "external source" refresh hook / `createExternalSource()`
  factory — still **DEFEND** (prior F2): the package will not encode a
  store's change-detection policy (React-dep vs. imperative subscription),
  and a refresh hook drags a React effect into the DOM-free core. The fix is
  a corrected _recipe_, not an export.
- **F3** React drag/pointer/gesture hook (now incl. expand + selection
  gestures) — still **DEFEND**: violates DOM-free core
  (`f(numbers,source)→numbers` only); the reference impl is a blessed recipe,
  not API. Re-confirmation widens the recipe's scope, not the package's.
- **F5** `select` added to `TreeIntent` — still **DEFER**: post-1.0 with an
  unresolved range-resolution-ownership question; the flagship consumer
  re-confirms the cost but not a resolution. Selection stays _Pluggable_ via
  `SelectionAdapter`, not intent-routed.

> Net: doctrine survived the _hard_ consumer too. The new gap (**F10**) and
> the `expandTo` throw (**F11.1**) are genuine in-core defects — pure math
> the package half-did, and a stale-id throw that contradicts the
> controller's own tolerance — not API the package owes. Everything else
> (F11.2 recipe, the F3/F5/rename re-confirmations) is documentation debt or
> a line held: the pure core is right, the un-owned glue is a recipe to
> harden, never an export to absorb.

---

## Status — actioned 2026-05-19

All Consumer-#2 pre-publish items shipped; doctrine-held items left as-is.

- **F10** ✅ `reverseChildren` threaded into the drag path.
  `resolveDropPosition`'s 5th arg is now an options object
  `{ desiredDepth?, reversed? }`; `createDrag`/`CreateDragOpts` gained
  `reversed`; `TreeController.startDrag` passes its
  `flatten.reverseChildren` through. The package now owns the before/after
  flip — no consumer-side flip, no visual-vs-document juggling. The
  `starterkit-hierarchy` dogfood was simplified accordingly (deleted its
  hand-rolled `docPlacement`; `hitTest` returns the visual side only).
  _API note:_ the `resolveDropPosition` 5th-param shape change is a
  breaking signature change to an exported function — acceptable
  pre-publish, blessed by the triage, mirrors F4's `{ into:false }`
  options-object style. `{ reversed }` itself is purely additive.
- **F11.1** ✅ `expandTo` walks the parent chain via `_peek`
  (returns `null` instead of throwing) instead of `ancestorsOf`; an
  unresolvable ancestor stops the walk. Finishes exactly the stale-id
  class CodeRabbit #4's guard stopped short of; `reveal()` is safe by
  extension.
- **F10 + F11.2 (docs)** ✅ README: new **"Reversed lists (layer
  panels)"** drag section; the **"Wrapping a live store"** recipe now
  mandates refreshing off the host's _imperative_ subscription and warns
  that host-state reference identity is not a reliable change signal
  (the wasm/Immer trap that silently staled the panel).
- Tests: **+6 → 118 green**. `drag.test.ts` reversed before/after/into +
  `createDrag`/`TreeController` reverse-threading; `controller.test.ts`
  `expandTo`/`reveal` stale-id regression; 4 `desiredDepth` positional
  callsites migrated to the options object.
- Verified live (`/canvas`, canvas/wasm backend): dragging the
  visually-bottom layer to the top reorders it to document-last and the
  panel reconciles (`domMatchesReversedDoc: true`); no crash, no error
  overlay; F11 insert-shows-without-select and select-no-crash still hold.

### Held (no code owed — defended, not deferred work)

- **F11.2** (refresh-hook / `createExternalSource()` factory) — **DEFEND**
  stands: the package will not encode a store's change-detection policy
  and won't drag a React effect into the DOM-free core. The fix was the
  corrected recipe above, not an export.
- **F3** (drag/expand/selection gesture hook) — **DEFEND** stands;
  re-confirmation widened the _recipe's_ scope, not the package surface.
- **F5** (`select` as a `TreeIntent`) — **DEFER** stands; selection
  remains _Pluggable_ via `SelectionAdapter`, range-resolution ownership
  still open post-1.0.
- Rename edit-mode state — **CONFIRM**: §State-ownership working as
  designed; documented expectation, no change.

> Net: the hard consumer cost two genuine in-core fixes (**F10**,
> **F11.1**) + one recipe correction (**F11.2**) — no new exported
> surface beyond F10's options object. Doctrine held; the package and its
> first two production consumers are publish-ready pending the F9
> test-resolution call.

---

## 2026-05-19 — Consumer #2 follow-up: horizontal pop-out wired

`starterkit-hierarchy` (layers panel) was Y-only at migration — drag
resolved drop from `clientY` alone; cursor-x was ignored. Wired the
horizontal pop-out (drag toward the left gutter to outdent a deeply
nested last child past its container).

**Decision — feature-request to the SDK, or consumer-owned?** Split, and
the split was already settled by precedent:

- The **gesture glue** (`clientX` → `dx` → depth, feeding `over()`) is
  **DEFEND / consumer-owned** — same line as F3, identical category to
  the `clientY` hit-test the consumer already owns. The SDK owes no
  feature here: it had already shipped _both_ pure halves —
  `desiredDepthFromX()` (`f(numbers)→number`) and
  `over(.., { desiredDepth })` + F10's `reversed`. Requesting "horizontal
  drop" from the package would mean absorbing `clientX`/`getBoundingClientRect`
  — exactly the DOM-free-core line held twice. So: **no SDK feature
  request; wired in the consumer**, ~1 helper call in `hitTest`.
- The **reverse-correctness of the pop-out math** is the SDK's — but
  that was already F10 (ACCEPT-CODE, shipped): controller owns
  `flatten.reverseChildren`, threads it into `over()`. Nothing further
  owed.

**Wiring (tree-node.tsx, no-regression invariant):**
`desiredDepthFromX(clientX - r.left, 0, TREE_INDENT, row.depth)`.
`indentBase: 0` is load-bearing — when the cursor rests anywhere on the
row, `dx` is large → `raw >> rowDepth` → clamped to `rowDepth` →
`resolveDropPosition`'s `while (depth > desiredDepth)` is immediately
false → anchor = `over` → **byte-identical to no-`desiredDepth`**. The
pop-out only engages as the cursor nears the left gutter (the helper's
documented "near the left edge → root level" use). `TREE_INDENT` is one
const shared by `<Tree indent>` and the geometry so gesture↔render can't
drift. `TreeDragLine` gained an **additive opt-in `indent` prop**
(default 0 → unchanged); Scenes passes nothing, so the global/Scenes
styling is untouched (same scoping discipline as the layers-only accent).

### F12 — `desiredDepth` × `reversed` has zero upstream coverage — **ACCEPT-CODE (test-debt)**

Grounded in the suite, not assumed: `desiredDepth` is covered in
`geometry.test.ts` (×9, pure `desiredDepthFromX`) and
`constraints.test.ts` (×8, **non-reversed**); `drag.test.ts` covers
`reversed` before/after/into with **no `desiredDepth`**. **No test
anywhere asserts the cross-product** (`grep desiredDepth.*reversed` →
none; `src/drag.ts:79` is only the type). Yet the pop-out's only real
trigger in a layer panel _is_ the cross-product: the walk fires on
post-flip `dir === "after"`, which under `reverseChildren` is a
**rendered `"before"`** gesture on a container's rendered-top (=
document-last) child. Same class as F10/F11.1: pure
`f(numbers,source)→numbers` the package half-tested. Owes a
`drag.test.ts` reversed+`desiredDepth` pop-out case. Until then the only
thing exercising it is the consumer — proven here 7/7 (deterministic,
against built `dist`); the package should mirror this exact contract:

```
source: <root>[a,b,c]; a:[a1,a2]   flatten.reverseChildren: true
startDrag(["c"])
 over("a1","before")                       -> {a,      idx 1, after}  // un-flip, no depth
 over("a2","before",{desiredDepth: 1})      -> {a,           , after}  // depth==own: no pop-out (no regression)
 over("a2","before",{desiredDepth: 0})      -> {<root>, idx 1, after}  // pop-out (post-removal idx)
 commit                                     -> move {to:{<root>,1,after,over:a2}}
```

### Package-observable behavior worth a README line (not a bug)

The pop-out is asymmetric by design (`drag.ts` "only `after` pops out,
not `before`"). Under `reverseChildren` that asymmetry maps to: the
gesture is available on the **rendered-top** child of a container
(doc-last), via a **rendered `"before"`** placement — _not_ the
rendered-bottom one. Coherent once you trace the flip, but non-obvious;
belongs in the README "Reversed lists (layer panels)" section so the
next consumer doesn't read it as broken.

> Net: no SDK feature owed (gesture = consumer glue, DEFEND; reverse-math
> = F10, already shipped). One new in-core **test-debt** item (**F12**,
> ACCEPT-CODE): the `desiredDepth`×`reversed` pop-out is the path that
> actually ships in a layer panel and it has no upstream test — the
> consumer is currently its only coverage. Doctrine held; surface
> unchanged.
