# @grida/tree-view

Headless, agnostic tree-view controller for editors and IDEs. **Zero
runtime dependencies.** No DOM imports in the core, no widget library on
top, no styling shipped — the package gives you a state machine plus a
small set of pure helpers, and you render the rows with whatever
framework and stylesheet you want.

Used in production by the Grida editor's layers panel and a handful of
prototype tools (Figma-style sidebar, VS Code-style file explorer,
Finder-style list view) — all driven by the same `TreeController`.

```bash
pnpm add @grida/tree-view
# React bindings are an optional peer:
pnpm add react@>=18
```

## Why this one

- **Zero runtime dependencies.** ~500 lines of business logic, ESM + CJS builds, full TypeScript types.
- **Pure core.** No DOM imports, no React imports, no globals — runs unchanged in Node, Bun, Deno, the browser, a web worker.
- **You own your data.** `TreeSource` is read-only — wrap your editor state, return rows; the package never mutates your store.
- **Subscribe-only-to-what-changes.** Six independent channels (`rows`, `expanded`, `focus`, `drag`, `selection`, `intent`) and identity-stable selectors keep re-renders tight.
- **Tested at the unit level.** A Node-environment suite — no jsdom, no Playwright — where every drag, constraint, and geometry edge case is reproducible in a pure unit test.
- **Production-grown.** Driven by the same controller as the Grida layers panel; the demo gallery reproduces Figma, VS Code, and Finder layer/file panels from the same code path.

## Features

### Core architecture

- **Headless state machine** (`TreeController`) — owns transient UI state (expand, focus, drag); delegates topology, meta, and selection to adapters.
- **Read-only data adapter** (`TreeSource`) — implement five methods (`getRoot`, `getNode`, `getVersion`, `subscribe`, optional `isContainer` / `getLabel` / `showRoot`) to plug into any editor state.
- **In-memory fallback** (`InMemoryTreeSource`) — for demos, tests, and standalone tools; ships `insertChild`, `move`, `remove`, `setMeta`, and `applyIntent` mutators.
- **Pluggable selection** (`SelectionAdapter`) — drop your editor's existing selection in; standalone uses get `InMemorySelectionAdapter` by default.
- **Six subscription channels.** `rows · expanded · focus · drag · selection · intent` — fine-grained so a row component only re-renders for its own slice.
- **Memoized flat row list.** `controller.getRows()` returns stable references keyed on `(source.version, expanded revision)`; safe to plug into virtualizers as-is.

### Drag & drop

- **Headless drag transaction** — `startDrag(items, { mode })` → `over(rowId, placement, { desiredDepth })` → `commitDrag()` / `cancelDrag()`. No pointer events, no DOM coupling.
- **Move and copy modes** — emitted as distinct `TreeIntent` kinds; mode can flip mid-drag (Alt-key in the demo).
- **Composable move constraints** — pure predicates that can also rewrite the drop position:
  - `onlyIntoContainers()` — coerce drops on leaves to "after" them.
  - `intoNearestAncestor(predicate)` — filesystem semantics: every drop lands inside the nearest valid ancestor; no-cycle guard built in.
  - `sameParentOnly()` — reorder-only; refuse cross-parent moves.
  - `disallowDescendant()` — never drop a node into its own subtree.
  - `allowWhen(predicate)` — free-form rule (lock checks, kind whitelists, …).
  - `allOf(...constraints)` / `not(constraint)` — composition.
- **Horizontal-aware ancestor pivot.** Cursor-x can "pop out" of deeply nested containers without changing the over-row — `resolveDropPosition` walks up the ancestor chain at last-child boundaries.
- **Outside-aware hit-testing.** Snap-to-edge fallback keeps the drop indicator alive when the cursor leaves the panel (`snapToEdge`).
- **Auto-scroll during drag.** `autoScrollDelta` — pure linear ramp into edge zones, capped to a max speed.
- **Drag threshold.** `passedDragThreshold` — L² norm check to distinguish a click from a drag.

### Keyboard

- **Configurable keymap dispatch.** `controller.keyDown(event, keymap)` — install whichever subset suits your tool.
- **Default keymap shipped, never auto-wired.** Graphics editors typically drop ArrowLeft/Right so the canvas can use them; that's a one-line override.
- **Modifier composition.** `modeFromEvent` resolves replace / toggle / range from Cmd/Ctrl/Shift consistently across platforms.
- **Range selection with anchor tracking.** Shift-arrow extends across visible rows, including freshly-expanded subtrees.
- **Intent-emitting actions.** Enter / F2 emits `rename`, Delete / Backspace emits `delete` — the consumer chooses how to handle them.

### React bindings (`@grida/tree-view/react`)

- **One provider, one snapshot hook.** `<TreeProvider controller={…}>` plus `useTree()` and `useTreeSnapshot(selector, equals?)` — the `useEditorState` pattern.
- **Identity-stable selectors.** `Object.is` short-circuit prevents re-renders when the selected slice is unchanged.
- **`useSyncExternalStore`-backed.** Concurrent-mode safe.
- **Optional peer.** React 18+ only loaded if you import `/react`; the core is React-free.
- **No row components shipped.** You bring the markup; recommended `data-state` styling pattern documented.

### Tree operations & helpers

- **Intent stream** — `move` / `copy` / `rename` / `delete` / `activate` emitted on the `intent` channel; the consumer is free to ignore, transform, or commit.
- **`InMemoryTreeSource.applyIntent(intent)`** — one-line bridge for standalone uses (move semantics; copy is intentionally not auto-handled).
- **`subtreeMembership(source, anchors, { inclusive? })`** — O(subtree size) set computation for "shade descendants of selected container" or "highlight folder + children on drag-over" features.
- **Depth helpers** — `rowDepthOf`, `ancestorAtRowDepth`, `ancestorsOf`, `isDescendantOf` for navigating the tree without consumers re-implementing the math.
- **Geometry helpers** — `placementFromY`, `desiredDepthFromX`, `passedDragThreshold`, `autoScrollDelta`, `snapToEdge`. All pure `f(numbers) → numbers`.
- **`resolveDropPosition`** — boundary-aware drop-position math used internally by the drag handle; exported for advanced consumer wiring.

### Patterns documented

- **Grouping highlight** — selection-aware shading (Grida / Figma) and drag-over folder + descendants (VS Code / Finder), both built on `subtreeMembership`.
- **`data-state` row styling** — single `data-state` attribute + Tailwind `data-[state=X]:` variants instead of nested className ternaries.
- **Indent spacer + sticky content cluster** — Figma layers-panel pattern for deeply nested rows, pure CSS (`position: sticky; right: 0`).
- **Virtualization recipe** — wire `getRows()` into `@tanstack/react-virtual` with both row-count and horizontal-scroll variants.
- **Filesystem-style drag** — `intoNearestAncestor` + the "drop-target folder + descendants" highlight, reproducing VS Code / Finder semantics.
- **Custom data sources** — adapt an arbitrary JSON tree without copying.
- **Wrapping a live store** — canonical `TreeSource` over an editor/remote store, with the reference-stability discipline.
- **External selection adapter** — delegate selection to a host store while keeping the keymap working.

## Quick start

```tsx
import {
  InMemoryTreeSource,
  TreeController,
  defaultKeymap,
} from "@grida/tree-view";
import { TreeProvider, useTree, useTreeSnapshot } from "@grida/tree-view/react";

// 1. Build a source. For real editors, implement `TreeSource` over your
//    own state; `InMemoryTreeSource` is the standalone fallback.
const source = new InMemoryTreeSource({
  root: "<root>",
  nodes: [
    { id: "<root>", parent: null, children: ["a"], meta: { label: "Root" } },
    { id: "a", parent: "<root>", children: ["a1"], meta: { label: "Folder" } },
    { id: "a1", parent: "a", children: [], meta: { label: "Item" } },
  ],
  showRoot: false,
});

// 2. Create a controller.
const controller = new TreeController({ source, expanded: ["a"] });

// 3. Render. Wrap once in <TreeProvider>; select state with useTreeSnapshot.
function Tree() {
  const rows = useTreeSnapshot((c) => c.getRows());
  return (
    <ul role="tree">
      {rows.map((row) => (
        <Row key={row.id} row={row} />
      ))}
    </ul>
  );
}

function Row({ row }) {
  const ctrl = useTree();
  const selected = useTreeSnapshot((c) => c.getSelection().includes(row.id));
  return (
    <li
      role="treeitem"
      aria-selected={selected}
      data-state={selected ? "selected" : "idle"}
      onClick={() => ctrl.select([row.id], "replace")}
      style={{ paddingLeft: row.depth * 16 }}
    >
      {row.id}
    </li>
  );
}

export default function App() {
  return (
    <TreeProvider controller={controller}>
      <Tree />
    </TreeProvider>
  );
}
```

That's the entire surface a basic layer panel needs. Drag, keymap,
constraints, virtualization, and grouping highlights are opt-in
additions documented below.

## Two entry points

```ts
// Core: state, math, intents — pure TypeScript, no React, no DOM.
import {
  TreeController,
  InMemoryTreeSource,
  defaultKeymap,
  // …pure helpers (geometry, constraints, drag)
} from "@grida/tree-view";

// React bindings: <TreeProvider> + useTree + useTreeSnapshot.
import { TreeProvider, useTree, useTreeSnapshot } from "@grida/tree-view/react";
```

`react` is an optional peer (`>=18`). The `/react` subpath is the **only**
React surface — there are no per-row hooks shipped. The intended pattern
is `useEditorState`-style: one provider, one subscription hook,
consumers select whatever slice they want.

## State ownership

The deciding question for a tree library is "who owns what." Both
fully-owning libraries (the consumer hands data to a black box) and
fully-passive libraries (every per-row event is a callback you wire) get
this wrong in different ways. We split the difference by what changes
per UI vs. per document:

| State                                        | Owner                              | Why                                                                      |
| -------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------ |
| Tree topology (parent / children / order)    | **Consumer** (`TreeSource`)        | The editor is already the source of truth; copying drifts.               |
| Per-node meta (label, kind, locked, mask, …) | **Consumer** (`TreeSource`)        | Same.                                                                    |
| Selection                                    | **Pluggable** (`SelectionAdapter`) | Editors with existing selection plug in; standalone users get a default. |
| Expanded set                                 | **Controller**                     | Pure UI state.                                                           |
| Focus (keyboard cursor)                      | **Controller**                     | Pure UI state.                                                           |
| Drag transaction                             | **Controller**                     | Transient.                                                               |
| Rename, hover, scroll                        | **Consumer**                       | Out of scope; the controller emits `intent` events only.                 |

Mutations like move / rename / delete are surfaced as **intents** on the
controller — the consumer subscribes and applies them against its own
state. The package never writes through your data model.

### Wrapping a live store

The canonical pattern when you own the data (an editor document, a remote
store). `InMemoryTreeSource` is the standalone fallback; for a real editor
you implement `TreeSource` over your state. The one discipline that bites
first-time adopters: **`getNode()` must be reference-stable** — reuse the
previous node object for unchanged nodes, or `useTreeSnapshot` sees a
store change every render (see the reference-stability contract on
`TreeSource`).

```ts
import type { TreeSource, TreeNode, NodeId } from "@grida/tree-view";

class MyTreeSource implements TreeSource<MyMeta> {
  private version = 0;
  private listeners = new Set<() => void>();
  private nodes = new Map<NodeId, TreeNode<MyMeta>>();

  constructor(store: MyStore) {
    this.snapshot(store);
  }

  /** Call when the underlying store changes, then bump the version. */
  refresh(store: MyStore) {
    this.snapshot(store);
    this.version++;
    for (const l of this.listeners) l();
  }

  private snapshot(store: MyStore) {
    const next = new Map<NodeId, TreeNode<MyMeta>>();
    for (const n of store.nodes) {
      const prev = this.nodes.get(n.id);
      // Keep the prior object when nothing this node renders from changed,
      // so selectors stay Object.is-stable.
      next.set(
        n.id,
        prev && prev.meta === n.meta && prev.children === n.childIds
          ? prev
          : { id: n.id, parent: n.parentId, children: n.childIds, meta: n.meta }
      );
    }
    this.nodes = next;
  }

  getRoot() {
    return "<root>";
  }
  getNode(id: NodeId) {
    const n = this.nodes.get(id);
    if (!n) throw new Error(`unknown node: ${id}`);
    return n;
  }
  getVersion() {
    return this.version;
  }
  subscribe(l: () => void) {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }
}
```

Then bridge intents back to your store's commands:

```ts
controller.subscribe("intent", (intent) => {
  if (intent.kind === "move")
    myStore.move(intent.items, intent.to.parent, intent.to.index);
  // rename / delete / activate → your store likewise
});
```

There is intentionally **no `createExternalSource()` factory**. The
version/identity policy — what counts as "changed", when to bump — is
yours; only you know your store's change semantics (the same reason
`InMemoryTreeSource.applyIntent` declines to auto-handle `copy`). The ~30
lines above are the whole pattern.

### External selection adapter

If selection already lives in your editor, **delegate through a
`SelectionAdapter` — don't bypass it.** Bypassing it (driving selection
purely from external state) means the keymap's selection actions (Space,
Shift+Arrow range, Cmd/Ctrl+A) have nowhere to route, so you re-implement
keyboard selection by hand. A thin delegate keeps `defaultKeymap`
working. Reuse the shipped pure `applySelection` so `add` / `toggle` /
`range` behave correctly (the controller pre-resolves `range` to a
concrete id list before calling `set`):

```ts
import { applySelection, type SelectionAdapter } from "@grida/tree-view";

const selection: SelectionAdapter = {
  get: () => editor.getSelectedIds(),
  set: (ids, mode) =>
    editor.setSelection(applySelection(editor.getSelectedIds(), ids, mode)),
  subscribe: (l) => editor.onSelectionChange(l),
};

const controller = new TreeController({ source, selection });
```

## Channels (subscription model)

`controller.subscribe(channel, listener)` — independent channels so a row
component only re-renders for what actually changed:

`rows` · `expanded` · `focus` · `drag` · `selection` · `intent`

The React `useTreeSnapshot` subscribes to all of them and re-runs the
selector; identity-stable returns (`Object.is`) short-circuit the React
re-render.

## Drag & drop

Drag is intentionally **not** wired by the package — the consumer
translates DOM events into number tuples and hands them to the pure
helpers below, then reads the resolved drop back through
`useTreeSnapshot`. That keeps the SDK DOM-free and lets you target any
input (pointer, touch, custom HTML5 DnD wrapper).

The helpers you'll wire on the consumer side:

- **`placementFromY(dy, rowHeight, { into? })`** — classifies cursor-y within a row into `before / into / after`. Pass `{ into: false }` for a flat / non-container list (reorderable tray, slide list): the row splits 50/50 into `before / after` only, so you don't hand-roll the binary case.
- **`desiredDepthFromX(dx, indentBase, indentStep, rowDepth)`** — converts horizontal cursor position into a target depth (for "pop out one container" gestures).
- **`passedDragThreshold(startX, startY, x, y, px)`** — L² drag threshold check.
- **`autoScrollDelta(top, bottom, y)`** — per-frame scroll delta when the pointer is near a container edge.
- **`snapToEdge(y, firstTop, lastBottom)`** — outside-aware "snap to first/last row" hit-test fallback.
- **`resolveDropPosition(source, items, over, placement, desiredDepth?)`** — boundary-aware drop-position math, including the horizontal-aware ancestor-pivot used by depth-sensitive drag.

Then drive the controller's `DragHandle`:

```ts
const handle = controller.startDrag([draggedId], { mode: "move" });
// on every pointermove:
handle.over(hoveredRowId, placement, { desiredDepth });
// on pointerup:
controller.commitDrag(); // emits a `move` (or `copy`) intent
// on Esc / cancel:
controller.cancelDrag();
```

The **`intent` channel is the canonical way to apply a drop** — subscribe
once and route every mutation (drag, keyboard, programmatic) through the
same path:

```ts
controller.subscribe("intent", (intent) => {
  if (intent.kind === "move")
    myStore.move(intent.items, intent.to.parent, intent.to.index);
});
```

`commitDrag()` _also returns_ the intent it just emitted — that return is a
convenience for imperative call sites that commit and apply inline without
subscribing. It is the **same** intent already sent on the channel; pick
one path, not both. (`handle.over()` only re-notifies when the resolved
position actually changes, so a per-pointermove `getDrag()?.getPosition()`
selector is cheap.)

### Constraints

Compose move-validity rules. The four built-ins:

```ts
import {
  allOf,
  not,
  onlyIntoContainers, // refuse "into" on leaf rows (auto-coerce to "after")
  sameParentOnly, // reorder-only — refuse cross-parent moves
  disallowDescendant, // refuse dropping into your own subtree (no cycles)
  allowWhen, // free-form predicate
} from "@grida/tree-view";

const constraint = allOf(
  onlyIntoContainers(),
  disallowDescendant(),
  allowWhen((items, to, source) =>
    items.every((id) => !source.getNode(id).meta?.locked)
  )
);
```

A constraint can also rewrite the position — `onlyIntoContainers` uses
this to turn "into a leaf" into "after that leaf at the parent level",
the same trick Figma's layers panel does.

## Default keymap

`defaultKeymap` is exported but **never wired automatically** —
consumers choose what to install. Graphics tools (canvas editors)
typically drop ArrowLeft/Right so arrow keys nudge canvas selection
instead.

| Key                | Action                                                 |
| ------------------ | ------------------------------------------------------ |
| ↑ / ↓              | Move focus                                             |
| →                  | Expand focused row (or no-op)                          |
| ←                  | Collapse, else jump to parent                          |
| Home / End         | Focus first / last                                     |
| Space              | Select focused (modifiers compose via `modeFromEvent`) |
| Cmd/Ctrl + A       | Select all visible                                     |
| Shift + ↑↓         | Range-extend selection                                 |
| Enter / F2         | Emit `rename` intent                                   |
| Delete / Backspace | Emit `delete` intent                                   |

## Grouping highlight

A common ask in real layer panels: when a container is selected, faintly
shade its descendants too (Grida / Figma); while dragging onto a folder,
light up the folder _and_ every visible child so the drop target's reach
is unambiguous (VS Code / Finder).

The package does **not** ship a built-in renderer for either. The visual
treatment is opinionated per editor — a backdrop tint, an indent rail,
a bracket — and the trigger is opinionated too (selection vs.
drag-over). What the package ships is the one pure helper both recipes
need:

```ts
import { subtreeMembership } from "@grida/tree-view";

// Inclusive of the anchors (the folder + everything under it).
const dropZone = subtreeMembership(source, [folderId]);

// Exclusive of the anchors (only the descendants).
const groupShade = subtreeMembership(source, selectedContainerIds, {
  inclusive: false,
});

// Then in the row renderer:
const inHighlight = dropZone.has(row.id); // O(1)
```

Pure and O(subtree size). Per-render, memoize on `source.getVersion() +
the anchor set` so each row's lookup stays O(1). The naive alternative —
every row walking its ancestor chain on every render — is O(N×D) per
drag tick. Don't ship that. If you find yourself writing it, that's the
signal to lift the set computation up one level.

## Recommended row styling pattern

Theme-able rows tend to grow nested ternary `className` cascades. The
pattern we use in the demos — and recommend — is to resolve the row's
visual state once and emit it as a `data-state` attribute, then write
all the variants as `data-[state=X]:…` Tailwind classes (or equivalent
attribute-selector CSS):

```tsx
const state = isDropTargetFolder
  ? "drop-target"
  : selected
    ? "selected"
    : inSelectionGroup
      ? "in-group"
      : focused
        ? "focused"
        : isDragActive
          ? "drag" /* suppresses hover */
          : "idle";

<div
  data-state={state}
  data-dragging={isDragging || undefined}
  data-hidden={!visible || undefined}
  className="
    data-[state=drop-target]:bg-blue-100
    data-[state=selected]:bg-blue-500 data-[state=selected]:text-white
    data-[state=in-group]:bg-blue-50
    data-[state=focused]:bg-zinc-100
    data-[state=idle]:hover:bg-zinc-50
    data-[hidden]:opacity-45
    data-[dragging]:opacity-40
  "
/>;
```

The advantages over inline ternaries: the className stays one block
(easy to grep and to override in a wrapping theme), orthogonal flags
(`dragging`, `hidden`, …) compose cleanly, and a non-React stylesheet
can target the same attributes if you ever ship a vanilla skin.

The full set of demo themes implementing this pattern lives at
`editor/app/(dev)/ui/components/tree-view/_themes.tsx` in the
repository.

### Indent spacer + content cluster (for deeply-nested rows)

When rows can go very deep (file explorers, mind maps, mask groups
chained dozens of levels), the indent `padding-left` will eventually
exceed any reasonable panel width. There are two stable patterns,
both pure CSS — the SDK doesn't ship a renderer for either:

1. **Plain horizontal scroll** — give the scroll container `overflow:
auto` and the inner list a `min-width` big enough to fit
   `indentBase + maxDepth × indentStep + cluster`. The container
   gains a horizontal scrollbar; the user scrolls right to see the
   deepest rows. Render cost is unchanged (virtualization is
   row-count-bound, not depth-bound).

2. **Sticky content cluster** (Figma layers-panel style) — split the
   row into an indent _spacer_ and a _content cluster_:

   ```tsx
   <div className="relative flex h-7 items-center">
     <span aria-hidden style={{ width: 4 + row.depth * 12, flexShrink: 0 }} />
     <span className="sticky right-0 inline-flex items-center gap-1 pr-2">
       <Chevron /> <Icon /> <Label />
     </span>
   </div>
   ```

   The spacer defines the row's natural width so the inner canvas is
   wider than the viewport and horizontal scroll engages. The cluster's
   `position: sticky; right: 0` keeps the chevron + icon + label
   floating at the right edge of the visible viewport whenever the
   natural x is off-screen; once the user scrolls far enough that the
   indent catches up, sticky releases and the cluster sits at its true
   indented position. Essential context (the icon, the row's name)
   stays visible at all scroll positions.

The "Virtualized + deeply nested" panel in the dev demo wires this
pattern end-to-end.

## Virtualization

Not bundled. `controller.getRows()` returns a stable flat list with
stable indices — wire it into `@tanstack/react-virtual` (or any other
windowing library) on the consumer side. The dev demo at
`editor/app/(dev)/ui/components/tree-view/` includes a worked recipe.

## Testing doctrine — for contributors

**All testable logic lives in the core. The React layer and any DOM
integration is a deliberately-thin shell.**

If something goes wrong, the rule is: _the bug must be reproducible
against the core in a Node unit test_. If you can't reproduce it there,
the API is the bug — push more logic down into the package until you
can.

That is why the package ships things you might expect to find in a
demo: `placementFromY`, `desiredDepthFromX`, `passedDragThreshold`,
`autoScrollDelta`, `snapToEdge`, `resolveDropPosition`,
`subtreeMembership`. The React layer / consumer just translates DOM
events into number tuples, hands them to these helpers, and reads
`controller.getDrag()?.getPosition()` back through `useTreeSnapshot`.
That is all the integration is allowed to do.

**Consequences:**

- Don't add logic to React hooks here. If you find yourself writing
  math in a hook, lift it into a pure module and unit-test it instead.
- Don't write Playwright / jsdom / RTL tests that exercise the package's
  behavior — they're slow, flaky, and tautological. The same coverage
  in a pure Node test is faster, cheaper, and catches more.
- Browser smoke tests are fine for **observing** rendering and
  integration glue. They are not the test of record for any logic.
- Anything you can't express as `f(numbers, source) -> numbers` belongs
  in the consumer, not the package.

The current Vitest suite (all node-environment, no jsdom)
covers: row flattening + memoization, selection dispatch, all constraint
combinators + composition, drag handle (incl. mode flip, descendant
refusal, horizontal-aware ancestor pivot with boundary validation),
geometry helpers, keymap dispatch including modifier composition, depth
helpers, subtree membership.

## License

MIT.
