---
id: TC-DESKTOP-BROWSER-004
title: Browser tabs show transient viewport thumbnails on hover
module: desktop
area: browser
tags: [browser, tabs, preview, thumbnail, focus]
status: untested
severity: medium
date: 2026-11-17
updated: 2026-11-17
automatable: partial
covered_by:
  - desktop/src/main/browser-host.test.ts
  - desktop/src/main/browser-host.electron.test.ts
  - editor/scaffolds/desktop/workbench/workspace-browser-tabs.test.ts
  - editor/scaffolds/desktop/workbench/editor-tab-browser-preview.test.tsx
  - editor/scaffolds/desktop/workbench/tab-preview-controller.test.ts
---

## Behavior

A deliberate hover on a browser tab uses the workbench's shared preview card.
It identifies the page by title and address and, when available, shows one
small still image of its last rendered viewport. Hovering leaves tab selection
unchanged. Capture itself never changes focus, shows a hidden page, changes its
viewport or starts continuous capture. The card composes above a visible live
page without hiding it. The still image may be stale. A blank,
unrendered or unavailable page shows metadata without broken-image chrome.

The preview retains image bytes only while mounted. Leaving the rail, closing
the page or replacing its attachment prevents a delayed result from appearing
in another tab. An installed browser-capable shell without thumbnail support
continues to show a metadata card.

## Steps

1. Open two browser tabs at controlled local pages with distinct colors and
   headings. Display each once, then select a workspace text file.
2. Rest the pointer over the first browser tab.
   - Expected: its title/address and recognizable page image appear. The text
     file remains selected and the browser page stays hidden.
3. Move directly to the second browser tab, then to the text-file tab.
   - Expected: the shared card changes to the corresponding page or file. No
     previous page image appears under a sibling's metadata.
4. Leave the rail, return to a browser tab, then close it while a capture is
   pending. Repeat while navigating or clearing browser data.
   - Expected: late results never resurrect a closed card or page image.
5. Hover a blank browser tab and a restored page that has not rendered yet.
   - Expected: a compact metadata card appears without an empty image box or
     broken-image icon.
6. Select a browser tab and hover its own tab while typing into a page input.
   - Expected: the preview does not select another tab or focus an input. If
     the card overlaps the viewport, the live page keeps advancing beneath it;
     leaving the rail preserves the page and its input state.
7. Keep one preview open for several seconds while the website changes.
   - Expected: it remains a still image. Leaving and hovering again may obtain
     a newer rendered image; no continuous or background capture runs.
8. Verify an older browser-capable shell that omits the optional thumbnail
   method.
   - Expected: browser tabs and their title/address hover cards still work.
