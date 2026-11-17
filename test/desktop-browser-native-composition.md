---
id: TC-DESKTOP-BROWSER-001
title: Live browser pages compose beneath workbench controls
module: desktop
area: browser
tags: [browser, layout, overlays, zoom, focus]
status: untested
severity: high
date: 2026-11-17
updated: 2026-11-17
automatable: partial
covered_by:
  - desktop/src/main/browser-host.electron.test.ts
  - editor/scaffolds/desktop/workbench/browser-guest-mounts.test.tsx
---

## Behavior

The browser page uses DOM composition below its toolbar. It follows workbench
layout and shell zoom, and shares its frame's rounded clipping. Workbench menus,
tooltips, popovers, previews and global modal backdrops appear above the live
page while video and animation visibly continue. Opening a control neither
hides the page nor substitutes a frozen screenshot. Ordinary modal focus
trapping, backdrop dismissal and return of page interaction remain effective.

Inactive or temporarily unpresented guests stay connected to the document but
are hidden and inert. Focus returns to an actual workbench element before
hiding a page. Removing or moving its presentation slot cannot expose fallback
geometry or leak page input into another tab.

## Steps

1. Open a workspace browser on a controlled local page containing a bright
   animated canvas, continuously advancing video, a frame counter and form
   input. Confirm frame-refusing headers do not prevent it from loading.
2. Resize the window, chat divider, File Explorer and terminal. Scroll inside
   the website. Expected: browser pixels remain inside the content frame and
   below the toolbar. No rectangle synchronization or overlay placeholder is
   involved.
3. Open the browser **…** menu and a workbench popover/preview overlapping the
   page. Expected: controls appear above continuously changing video/animation.
   Dismiss with Escape; normal page input immediately works again.
4. Open a real global workbench modal across the page. Expected: its backdrop
   dims the page while visible video/animation advances; clicks on the page
   cannot activate it. Tab/Shift-Tab cycle only within the modal. Exercise
   Escape, outside dismissal and explicit close separately, then verify page
   pointer and keyboard interaction resume.
5. Switch tabs with a page input focused and while the menu is open. Expected:
   the hidden guest receives no keystrokes/clicks, its menu closes, and its
   form value remains on return. Remount workbench chrome and move its
   presentation slot; the same guest and running document remain connected.
6. Change shell zoom, resize and enter/exit fullscreen. Move between displays
   with different scales where available. Expected: alignment and corner
   clipping remain correct. Change the shared frame radius without resizing,
   including zero radius; bottom corners update together with no pixel leak.
7. Repeat after a cold Desktop launch. Record OS, Electron version, display
   configuration and which input/IME paths were actually exercised. Unit tests
   and a synthetic Electron fixture do not replace actual workbench evidence.
