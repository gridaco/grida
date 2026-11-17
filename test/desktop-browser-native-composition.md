---
id: TC-DESKTOP-BROWSER-001
title: Native browser pages follow the content viewport and yield to workbench overlays
module: desktop
area: browser
tags: [browser, native, layout, overlays, zoom]
status: untested
severity: high
date: 2026-11-17
updated: 2026-11-17
automatable: partial
covered_by:
  - desktop/src/main/browser-host.electron.test.ts
  - editor/scaffolds/desktop/workbench/browser-viewport.test.ts
---

## Behavior

A native browser page occupies only its content viewport, below its toolbar.
It follows workbench layout and window zoom. Workbench menus, dialogs and
previews remain usable: overlapping UI hides the native page and displays a
neutral placeholder until the overlay ends. Website contents are not copied
into the workbench to produce that placeholder.

The frame's CSS radius also controls the page viewport's uniform corner clip.
Native pixels must not escape the rounded frame's bottom corners. Changing
only the CSS radius updates both DOM and native clipping without resizing.

## Steps

1. Open a workspace browser tab on a local server with a visibly colored page.
2. Resize the window and the chat/content divider. Open and resize File
   Explorer and the bottom terminal utility. Expected: the page follows its
   viewport without painting over the toolbar, chat, tree or terminal.
3. Open a workbench menu or dialog that overlaps the page. Hover a neighboring
   file tab long enough to show its preview. Expected: the shell overlay stays
   usable, the browser shows a neutral placeholder, and dismissing the overlay
   restores the same page without navigation.
   Open the browser's **…** menu and dismiss it with Escape. Expected: both
   actions are available, the page yields to the menu, and focus returns to
   the menu trigger. A blank page disables **Open in default browser**.
4. Switch to another tab. Expected: the native page no longer paints or
   receives input in the content area. Switch tabs with the browser menu open;
   its menu closes and does not reopen when returning to the page.
5. Change shell zoom and enter/exit fullscreen. Move the window between displays
   with different scaling where available. Expected: page bounds stay aligned
   with the reserved viewport.
6. Repeat after a cold Desktop launch, recording the operating system and
   display configuration used.
7. With a colored page visible, change the content frame's border radius in
   renderer DevTools without changing its dimensions. Expected: the DOM page
   viewport and native page update together, with no leaked bottom corners.
   Repeat at non-default shell zoom and with a zero radius.
