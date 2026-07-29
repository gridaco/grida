# `@/kits/memory-navigator`

`MemoryNavigator` is a scoped, in-memory back stack for experiences that need
route-like navigation without owning the browser URL. The host supplies opaque
route values and per-entry state; the navigator only preserves their history.

It is useful when a widget can open nested views but must disappear cleanly
with its host, such as a picker, inspector, or embedded explorer.

## Contract

- One initial entry always exists.
- `push` adds an entry.
- `replace` changes the current entry without adding history.
- `back` returns to the previous entry and reports whether it moved.
- `updateCurrentState` replaces state on the current entry. That state remains
  attached to the entry when navigating away and back.
- State updaters are pure: attempting to navigate from an updater is rejected
  before the stack changes.
- `getSnapshot` returns the same object until a successful mutation.
- `subscribe` synchronously reports successful mutations and returns an
  unsubscribe function. Delivery uses a listener snapshot; one failed observer
  is reported without blocking navigation or the remaining observers.

Routes and state are treated as immutable values. Entry and snapshot wrappers
are shallowly frozen; callers must replace, rather than mutate, nested state.

## Usage

```ts
import { MemoryNavigator } from "@/kits/memory-navigator";

type Route = { kind: "feed"; query: string } | { kind: "object"; id: string };

type EntryState = {
  anchorId: string | null;
  scrollTop: number;
};

const navigator = new MemoryNavigator<Route, EntryState>({
  route: { kind: "feed", query: "editorial poster" },
  state: { anchorId: null, scrollTop: 0 },
});

navigator.updateCurrentState((state) => ({
  ...state,
  anchorId: "asset-42",
  scrollTop: 640,
}));

navigator.push({
  route: { kind: "object", id: "asset-42" },
  state: { anchorId: null, scrollTop: 0 },
});

navigator.back();
// navigator.current.state.scrollTop === 640
```

The class has no React dependency. A React edge can subscribe without adding
navigation logic to a hook:

```tsx
const snapshot = useSyncExternalStore(
  navigator.subscribe,
  navigator.getSnapshot,
  navigator.getSnapshot
);
```

## Deliberate non-goals

- Browser or Next.js history integration
- Forward navigation
- Route parsing or matching
- Rendering and transition behavior
- Scroll measurement or restoration policy
- Persistence beyond the owning host's lifetime

Those concerns belong to the feature that owns the navigator.
