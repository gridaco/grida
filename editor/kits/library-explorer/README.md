# `@/kits/library-explorer`

`LibraryExplorerView` is the reusable, scoped Library experience used by
embedded Desktop surfaces. It renders an infinite masonry feed, opens a focused
object, pages through similar objects, supports nested object navigation, and
restores the prior feed position on Back.

The public Library website keeps using Next.js routes. Embedded surfaces use
this kit because their navigation must disappear with the host tab or Welcome
page and must not mutate the browser URL.

## Contract

The host supplies:

- an initial `browse` or `search` source (read once for the explorer's scoped
  lifetime; remount to start a different root search);
- an injected page loader for `browse`, `search`, and `similar`;
- the host's scroll container;
- controlled selection state and an `onToggle` callback.

The kit owns:

- its scoped navigation stack;
- one cached result set per navigation entry;
- infinite-page request ordering, explicit retry, and stale-response rejection;
- masonry scroll anchors and Back restoration;
- card, object, related-feed, and focus-feedback UI.

It does not import route actions, workbench state, or the Next.js router.
Closing the host disposes the whole explorer history.

Page-loader ranges are inclusive at both ends. `exactCount` is optional but,
when supplied, must be an exact terminal bound rather than a database estimate.
Without it, a page shorter than the requested range ends the feed.

## Navigation

The route shape is deliberately small:

```txt
feed(browse | search)
  → object(id) / similar(id)
    → object(id) / similar(id)
```

The underlying stack is the agnostic
[`MemoryNavigator`](../memory-navigator/README.md). Library semantics stay in
this kit; the navigator knows only opaque routes and entry state.
