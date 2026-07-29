---
id: TC-DESKTOP-LIBRARY-001
title: Explore nested Library references and return to the prior feed position
module: desktop
area: library
tags: [desktop, library, navigation, masonry, infinite-scroll]
status: untested
severity: medium
date: 2026-07-29
updated: 2026-07-29
automatable: false
covered_by:
  - editor/kits/memory-navigator/memory-navigator.test.ts
  - editor/kits/library-explorer/library-explorer.test.ts
  - editor/kits/library-explorer/masonry-scroll.test.ts
  - editor/kits/library-explorer/library-explorer-viewport.test.ts
---

## Behavior

Embedded Library galleries behave like one scoped explorer rather than opening
browser routes. Clicking a reference opens it with an infinite feed of similar
references. Similar references can be opened repeatedly. Back returns one level
at a time to the cached feed, restores the prior masonry position, and returns
keyboard focus to the card that opened the child view. Closing the host disposes
its private history.

The agent reference picker and Desktop Welcome use the same interaction. Their
host-specific state remains intact: picker selections survive exploration, and
Welcome selections remain attached to its composer.

## Steps

1. Open Desktop Welcome, scroll into the Library gallery, and select one
   reference.
   - Expected: the reference appears in the composer tray.
2. Click that reference in the composer tray.
   - Expected: its card is revealed and highlighted in the current feed.
3. Click the body of a different Library card.
   - Expected: a focused version of that reference appears, followed by a
     masonry feed that continues loading while scrolling.
   - Expected: Add remains attached to the image’s top-right corner at both
     narrow and wide window sizes.
   - Expected: the existing composer selection remains selected.
4. Click the selected reference in the composer tray if it is absent from the
   related feed.
   - Expected: its focused detail is pushed onto the current explorer history.
   - Expected: Back returns to the related feed.
5. Scroll the related feed and open one of its cards, then open one more related
   card.
   - Expected: each click opens a new focused reference without leaving the
     Welcome route.
   - Expected: Back remains visible while scrolling deep into related results.
6. Use Back twice.
   - Expected: each Back returns exactly one level, restores the prior feed near
     its former position, and returns keyboard focus to the card that was opened.
7. Back out to the original Welcome feed.
   - Expected: its previously loaded cards and scroll position are restored
     without starting again at the top.
   - Expected: the composer tray still contains the reference selected in step
     1.
8. Open an agent Library reference picker and repeat the nested exploration.
   - Expected: nested exploration and restoration match Welcome.
   - Expected: references selected before or during exploration remain in the
     floating selection bar and can still be submitted.
9. Select a reference, change the search so that reference is no longer in the
   current results, then click its thumbnail in the floating selection bar.
   - Expected: its focused detail is pushed onto the current explorer history.
   - Expected: Back returns to the current search results, not the old search.
10. Click a selected thumbnail that is present in the current results.
    - Expected: its card is revealed and highlighted without opening a detail.
11. Close the picker tab while inside a nested object.
    - Expected: the pending picker is skipped/cancelled as before; reopening a
      later picker starts with a fresh scoped history.
