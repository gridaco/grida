# `@grida/svg-editor` — tests

How we test this package, and the patterns / pitfalls worth pinning so
they don't get re-learned the hard way.

## Layers

- **Pure logic** — math, parsers, reducers, path models.
  Co-located `*.test.ts`, `environment: "node"`. Most of this folder.
- **Surface contracts** — what the HUD-side state machine expects from
  the host, and vice versa. Headless. `dom.ts` is not mounted; we test
  via direct method calls and stub providers.
- **End-to-end UX** — manual TCs under [`test/`](../../../test/).
  Mounting the DOM surface in jsdom is intentionally not supported
  here (see `presets-keynote.test.ts` for the rationale: jsdom's
  canvas peer is broken in this monorepo).

## Pattern: index identity across the `d` round-trip

PathModel ops that emit a new `d` and return an index — currently
`splitSegment`, but the rule generalizes — MUST return a **canonical
(path-order)** index. Not the in-memory (insertion-order) index that
`VectorNetworkEditor` natively produces. The two index spaces alias
across `toSvgPathD → fromSvgPathD`, and consumers re-derive their
PathModel from the live `d` every frame.

### The two index spaces

- **In-memory (insertion-order).** `VectorNetworkEditor.splitSegment`
  does `_vertices.push(splitPoint) - 1`. The new vertex's index is
  the length of the array BEFORE the push. For a 2-vertex network,
  that's `2`.
- **Canonical (path-order).** `PathModel.fromSvgPathD(d)` walks SVG
  commands left-to-right. The new midpoint sits BETWEEN its
  neighbours in path-order, so its canonical index is `1` (between
  start `0` and end `2`).

`toSvgPathD` does NOT preserve in-memory ordering — it walks segments
in path order. So the in-memory model and its d-roundtripped re-parse
have the SAME vertex coordinates in DIFFERENT positions.

### The contract

> **`PathModel.splitSegment(seg, t)` returns the canonical index of the
> new vertex.** Consumers that re-derive a `PathModel` from the live
> `d` can address the new vertex by the returned index directly. The
> returned `model` is canonical too — subsequent ops on it use the
> same index space.

Enforced inside `splitSegment` by round-tripping the post-split model
through `toSvgPathD → fromSvgPathD` and locating the new vertex by
coordinate match.

### Test it like this

When testing an op that returns an index AND emits a new `d`, check
that the SAME index addresses the SAME vertex in the d-roundtripped
model:

```ts
const { model, new_vertex } = m.splitSegment(0, 0.5);
const target_d = model.toSvgPathD();
const live_model = PathModel.fromSvgPathD(target_d);
expect(live_model.snapshot().vertices[new_vertex]).toEqual(
  model.snapshot().vertices[new_vertex]
);
```

For end-to-end behaviour, simulate the host's chain:

```ts
const { model: split_model, new_vertex } = m.splitSegment(0, 0.5);
const target_d = split_model.toSvgPathD();
// Mimic the host: re-derive from `d`, apply the translate.
const live_model = PathModel.fromSvgPathD(target_d);
const moved = live_model.translateVertices([new_vertex], [0, 30]);
// Assert the SPECIFIC vertex moved — not just "some vertex moved."
const verts = moved.snapshot().vertices;
expect(verts[0]).toEqual([100, 120]); // start unchanged
expect(verts[2]).toEqual([300, 120]); // end unchanged
expect(verts[new_vertex][1]).toBe(150); // new vertex moved
```

Live coverage: `__tests__/path-model-vector-edit.test.ts`, under
`describe("PathModel splitSegment")`.

## Anti-pattern: sentinel indices not bound to a model

The split-and-drag bug was browser-observable for a chunk of time
while the headless test passed. The reason: the test fixture stubbed
`setVectorSelection` to echo a hardcoded index that wasn't bound to
any actual model:

```ts
// Synthetic fixture — looks reasonable, hides the bug.
emitIntent: (i) => {
  intents.push(i);
  if (i.kind === "split_segment") {
    state.setVectorSelection({ vertices: [99], … });
  }
};
```

The test asserted that `99` flowed through the intent chain. It did.
Every assertion in the test was about plumbing — does the integer end
up in the right intent? Yes.

But `99` is not bound to any actual model. The fixture never
roundtripped `d`, so the index-aliasing across `toSvgPathD → fromSvgPathD`
never had a chance to fire. The fixture only proved "the intent's
`indices` field is propagated" — which was never in doubt.

**Rule of thumb: when an integer index is part of a contract that
bridges two layers, the test must exercise both layers with REAL data.**
A hardcoded sentinel that flows through without binding to a model is
a red flag — that integer means nothing on its own. Replace the
synthetic fixture with a real model round-trip, or compose two layers'
real behaviours in the test fixture.

## Pitfall: headless vs browser divergence

The split-and-drag bug was invisible in `@grida/hud`'s unit tests
because those tests stub the host as a `(intent) => void` function.
The HUD never round-trips `d`; it only sees the indices the host
publishes. So any bug that lives in the index-renumbering across the
host's `d`-roundtrip is structurally outside the HUD's test surface.

Two takeaways:

1. **The HUD's tests pin its OWN behaviour. They cannot replace
   integration tests that exercise the host contract.** If a behaviour
   depends on the host doing X, the test must run with a host that
   actually does X — not a stub that mimics X's signature.
2. **When a browser bug doesn't reproduce headlessly, the test
   fixture is the prime suspect.** Don't assume the headless test is
   correct because it passes; assume it's testing the wrong thing.
   Use `preview_eval` to read live state and find where the divergence
   is — then narrow it down to a fixture / model layer.

## Pitfall: selection survival across `d`-writes

A consequence of having two index spaces is that ANY vertex selection
held across a `d`-write can alias. Pre-split index `1` (the endpoint)
becomes post-split index `2`. The host's `editor.subscribe`
d-reconcile block in `dom.ts` defensively CLEARS sub-selection on
external d-writes — "the safe, honest behaviour is to drop sub-selection;
the user can re-pick." This pairs with the canonical-index contract:
PathModel ops that emit a new `d` MUST return canonical indices, AND
any selection held by the session across an external d-write is dropped.

If a future op emits a new `d` and returns indices, run it through the
same `toSvgPathD → fromSvgPathD` canonicalization. The single source of
truth is the path-order index.

## When you add a new test file

- Co-locate with the module it tests. `__tests__/foo.test.ts` mirrors
  `src/foo.ts`. New module → new sibling test file.
- Behaviour-named `it("…")` descriptions, design-intent comments above
  each test, behaviour-not-implementation assertions. The HUD package's
  [README §"UX Testing"](../../grida-canvas-hud/README.md#ux-testing)
  is the canonical reference for the style.
- If the test depends on a host-side contract (e.g., "host calls
  `setVectorSelection` synchronously during `emitIntent(split_segment)`"),
  spell that contract out in the test fixture's comment. If the
  contract changes, the test should change with it.
