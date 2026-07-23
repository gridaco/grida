---
id: TC-DESKTOP-WORKBENCH-004
title: Workspace tabs show delayed semantic previews
module: desktop
area: workbench
tags: [workspace, tabs, tab-preview, thumbnail, canvas, media]
status: untested
severity: medium
date: 2026-07-23
updated: 2026-07-23
automatable: false
covered_by:
  - editor/scaffolds/desktop/workbench/tab-preview-controller.test.ts
  - editor/scaffolds/desktop/workbench/tab-preview-position.test.ts
  - editor/scaffolds/desktop/workbench/workspace-tab-thumbnail.test.ts
---

## Behavior

A deliberate hover on a real workspace-file tab shows a compact,
informational preview without selecting the tab or moving focus.
The card identifies the filename, parent path, file family, and unsaved state.
It renders semantic document content when available: the authored `.canvas`
cover (falling back to the first slide or a fitted board overview), an SVG or
raster image, or a still video frame. Text-like and unavailable files degrade
to a compact metadata-only card rather than showing a placeholder or broken
preview.

The preview is lazy and non-interactive. Sweeping across the tab strip should
not flash cards, hovering must not trigger document writes, and the card must
not interfere with selecting, closing, middle-clicking, dragging, scrolling, or
opening a tab's context menu. Faux and virtual tabs do not receive a stale
file preview.

## Steps

1. Open a workspace containing at least two images, one slide `.canvas`, one
   freeform `.canvas`, a video, and a text file. Open each as a tab.
2. Move the pointer quickly across several tabs.
   - Expected: no preview flashes during the quick sweep.
3. Rest the pointer over an inactive image tab for about half a second.
   - Expected: a card opens below the tab with the contained image, filename,
     and parent/type metadata. The inactive tab is not selected.
4. Without leaving the tab strip, move directly to the adjacent real tab.
   - Expected: its preview replaces the first one immediately, with no second
     deliberate delay and no moment where two cards overlap. The shared card
     glides from the previous tab rather than opening a second card.
5. Leave the tab strip, re-enter it, and rest over another real tab.
   - Expected: the initial half-second delay applies again, and the card opens
     at the new tab instead of gliding from the previous pointer pass.
6. Repeat for the slide deck and freeform canvas.
   - Expected: an authored bundle thumbnail wins when present. Without one, the
     deck shows its first renderable slide and the board shows a fitted overview
     of its placed documents.
7. Hover a video tab.
   - Expected: a muted still frame appears when Chromium can decode the file;
     otherwise the thumbnail region is omitted. Playback never starts.
8. Hover a text tab and a deliberately unsupported or malformed media file.
   - Expected: each shows only its compact filename/type metadata, with no
     thumbnail region or broken-image chrome.
9. Make an editable SVG, Markdown, or text tab dirty, then hover it.
   - Expected: the card says `Unsaved`; any visual represents the last saved
     state rather than claiming to show unsaved editor pixels.
10. Leave a real tab hovered for more than one second.
    - Expected: only the custom card is visible; no native browser title tooltip
      appears over it.
11. With the card visible, select the tab, use its close button, middle-click
    another tab, and right-click to open the file context menu.
    - Expected: every existing tab action still works and the preview never
      obstructs the context menu.
12. Focus a tab with the keyboard.
    - Expected: focus remains normal tab navigation and does not open or pin a
      hover preview. Enter/Space still selects the tab.
13. Horizontally scroll the tab strip, then preview a partially visible end tab
    in a narrow window.
    - Expected: scrolling continues when a gap between tabs passes under the
      stationary pointer. The portaled card is collision-adjusted inside the
      window and is not clipped by the scroll container or placed under window
      controls.
    - Expected: selecting the first or last tab with `⌘⌥←` / `⌘⌥→` scrolls it
      into view with the rail's matching start/end padding still visible.
14. Close or switch the tab while its preview is still loading.
    - Expected: no stale card or thumbnail appears for a different tab.
15. Close every real file tab, then hover Quick Start. If available, also open
    the Pick references virtual tab.
    - Expected: neither faux/virtual tab receives a file thumbnail.
