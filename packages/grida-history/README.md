# @grida/history

Dependency-free transaction and undo/redo engine for JavaScript/TypeScript.

History does not know what your state looks like, how it's stored, or how it's rendered. It manages **deltas** — forward/backward transformation pairs — organized into **transactions** on an undo/redo **stack**. You bring your own state; History coordinates it.

```
npm install @grida/history
```

---

## Quick Start

```ts
import { HistoryImpl } from "@grida/history";

const history = new HistoryImpl();
let x = 0;

// Make a change
history.atomic("move right", (tx) => {
  const before = x;
  x = 100;
  tx.push({
    providerId: "app",
    apply: () => {
      x = 100;
    },
    revert: () => {
      x = before;
    },
  });
});

x; // 100
await history.undo();
x; // 0
await history.redo();
x; // 100
```

---

## Core Concepts

### Delta

The atomic unit of change. A pair of functions — one to apply, one to revert — plus metadata.

```ts
interface Delta<D = unknown> {
  readonly providerId: string; // who owns this change
  readonly descriptor?: D; // optional structured metadata
  apply(): void;
  revert(): void;
}
```

History never inspects `apply()` or `revert()`. It never reads `descriptor`. Your deltas can mutate any state — a plain object, a DOM node, a WASM module, a database row. History just calls the functions.

### Transaction

Groups deltas into a single undo/redo step.

```ts
const tx = history.begin("resize shape");
tx.push(widthDelta);
tx.push(heightDelta);
tx.commit(); // one Cmd+Z undoes both
```

- **`commit()`** seals the transaction and pushes it onto the undo stack.
- **`abort()`** reverts all deltas in reverse order. Nothing touches the stack.
- Committing an empty transaction is a silent no-op.

For synchronous operations, use the shorthand:

```ts
history.atomic("resize shape", (tx) => {
  tx.push(widthDelta);
  tx.push(heightDelta);
});
// If the function throws, all deltas are reverted automatically.
```

#### Nesting

Transactions nest. Inner commit merges deltas into the outer transaction. Inner abort reverts only the inner deltas.

```ts
const outer = history.begin("drag with clone");

const inner = history.begin("clone element");
inner.push(duplicateDelta);
inner.push(insertDelta);
inner.commit(); // merged into outer

outer.push(translateDelta);
outer.commit(); // one undo step for everything
```

### Preview

A tentative change that is never committed to the stack. For "try before you buy" interactions — font pickers, color samplers, slider scrubbing.

```ts
const preview = history.preview("change font");

// User hovers "Helvetica"
preview.set(helveticaDelta); // applied, stack untouched

// User hovers "Georgia"
preview.set(georgiaDelta); // Helvetica reverted, Georgia applied

// User clicks "Georgia"
preview.commit(); // now on the undo stack

// — OR —

// User closes picker
preview.discard(); // Georgia reverted, stack untouched
```

A preview holds one active delta at a time. Each `set()` reverts the previous before applying the new one. If the user triggers undo while a preview is active, the preview is discarded first.

### Stack

Two lists — past and future — with a configurable max depth.

```ts
const history = new HistoryImpl({ maxDepth: 200 });

history.stack.canUndo; // boolean
history.stack.canRedo; // boolean
history.stack.undoLabel; // "resize shape" | null
history.stack.pastCount; // number
history.stack.futureCount; // number
```

### Events

```ts
history.on("onChange", (tx) => {
  /* any commit, undo, or redo */
});
history.on("onUndo", (tx) => {
  /* undo only */
});
history.on("onRedo", (tx) => {
  /* redo only */
});
history.on("onError", (tx, error) => {
  /* delta threw during undo/redo */
});

// Returns a Disposable — call .dispose() to unsubscribe.
```

---

## Recipes

### Drag to Move

Open a transaction on pointer-down, push one delta on pointer-up.

```ts
// pointer down
const tx = history.begin("move shape");
const original = { x: node.x, y: node.y };

// pointer move (60fps — no deltas, just render)
function onPointerMove(x: number, y: number) {
  node.x = x;
  node.y = y;
}

// pointer up
tx.push({
  providerId: "document",
  apply: () => {
    node.x = final.x;
    node.y = final.y;
  },
  revert: () => {
    node.x = original.x;
    node.y = original.y;
  },
});
tx.commit();

// — OR: Escape to cancel —
node.x = original.x;
node.y = original.y;
tx.abort();
```

### Font Picker Hover

```ts
const original = node.font;
const preview = history.preview("change font");

function onHover(font: string) {
  preview.set({
    providerId: "document",
    apply: () => {
      node.font = font;
    },
    revert: () => {
      node.font = original;
    },
  });
}

function onSelect() {
  preview.commit();
}
function onClose() {
  preview.discard();
}
```

### Remote Changes (Collaboration)

Apply remote changes without adding them to the local undo stack.

```ts
history.atomic(
  "remote edit",
  (tx) => {
    applyRemoteOps(ops);
    // push deltas if you need onChange to fire
  },
  { origin: { type: "remote", peerId: "user-42" }, record: false }
);
```

### AI Agent

AI writes are regular transactions with a distinct origin.

```ts
// Single atomic write
history.atomic(
  "ai: fix layout",
  (tx) => {
    tx.push(frameDelta);
    tx.push(textDelta);
    tx.push(imageDelta);
  },
  { origin: { type: "ai", agentId: "layout-agent" } }
);

// Streaming write
const tx = history.begin("ai: restyle", {
  origin: { type: "ai", agentId: "style-agent" },
});
try {
  for await (const change of ai.stream()) {
    applyChange(change);
    tx.push(makeDelta(change));
  }
  tx.commit();
} catch {
  tx.abort(); // reverts everything
}

// AI suggestion preview
const preview = history.preview("ai: suggestion");
preview.set(suggestionDelta);
// User accepts → preview.commit()
// User rejects → preview.discard()
```

### Selection Changes (Preserve Redo)

Selection changes shouldn't clear the redo stack so users can click around between undo and redo.

```ts
history.atomic(
  "select",
  (tx) => {
    tx.push(selectionDelta);
  },
  { clearsFuture: false }
);
```

---

## Providers

Providers are external systems that participate in the undo/redo lifecycle. Register a provider so History can call `prepare()` before executing deltas that belong to it.

```ts
const provider = history.register({
  id: "text-session",
  prepare: async () => {
    // Reopen a WASM session if it was garbage-collected
    if (!wasm.hasSession(nodeId)) {
      await wasm.reopenSession(nodeId);
    }
    return { dispose: () => {} };
  },
  reset: () => {
    // Called on history.clear()
  },
});

// Later:
provider.dispose(); // unregister
```

`prepare()` is called once per provider per undo/redo operation, before any deltas execute. If it returns a Promise, History waits. If it rejects, the undo/redo is cancelled.

---

## Error Handling

If a delta throws during undo/redo:

1. Already-executed deltas stand (not rolled back).
2. Remaining deltas are skipped.
3. The transaction is removed from the stack (no infinite retry loop).
4. `onError` fires.

```ts
history.on("onError", (tx, error) => {
  console.error(`Undo failed for "${tx.label}":`, error);
  // Optionally reload document to restore consistency
});
```

---

## API Reference

### `new HistoryImpl(opts?)`

| Option     | Type     | Default | Description              |
| ---------- | -------- | ------- | ------------------------ |
| `maxDepth` | `number` | `100`   | Maximum undo stack depth |

### `history.begin(label, opts?)`

Open a transaction. Returns `Transaction`.

### `history.atomic(label, fn, opts?)`

Open, run `fn(tx)`, commit. If `fn` throws, abort.

### `history.preview(label)`

Open a preview. Returns `Preview`.

### `history.register(provider)`

Register a `HistoryProvider`. Returns `Disposable`.

### `history.undo()` / `history.redo()`

Returns `boolean` (sync) or `Promise<boolean>` (if any provider has async `prepare()`). Returns `false` if blocked (open transaction, empty stack, or prepare failure).

### `history.on(event, handler)`

Subscribe to events. Returns `Disposable`.

### `history.stack`

Read-only access to `canUndo`, `canRedo`, `undoLabel`, `redoLabel`, `pastCount`, `futureCount`.

### `history.busy`

`true` while an async undo/redo is in flight.

### TransactionOptions

| Option         | Type                | Default             | Description                 |
| -------------- | ------------------- | ------------------- | --------------------------- |
| `origin`       | `TransactionOrigin` | `{ type: "local" }` | Who initiated this change   |
| `record`       | `boolean`           | `true`              | Push to undo stack?         |
| `clearsFuture` | `boolean`           | `true`              | Clear redo stack on commit? |

---

## Design Constraints

- **Zero runtime dependencies.** The package is a single self-contained module.
- **State-agnostic.** History never inspects your state, your deltas, or your descriptors.
- **Synchronous deltas.** `apply()` and `revert()` must be synchronous. Async preparation goes in `provider.prepare()`.
- **Undo blocked during open transactions.** `undo()` returns `false` while any transaction is open. The consumer decides whether to abort or commit first.
- **Preview auto-discards on undo.** Active previews are discarded before undo proceeds.
- **Best-effort error handling.** Delta failures don't roll back already-executed deltas. The broken transaction is removed from the stack.

---

## License

MIT
