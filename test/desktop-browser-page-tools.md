---
id: TC-DESKTOP-BROWSER-009
title: Browser utilities act on the selected website guest
module: desktop
area: browser
tags: [browser, find, zoom, print, inspect, context-menu, focus]
status: untested
severity: medium
date: 2026-11-18
updated: 2026-11-18
automatable: partial
covered_by:
  - desktop/src/main/browser-page-tools.test.ts
  - desktop/src/main/browser-find-dialog.test.ts
  - desktop/src/main/browser-host.test.ts
  - editor/lib/desktop/browser-page-controls.test.ts
---

## Behavior

Find, page zoom, print and inspection target the actual admitted website guest.
A delayed search cannot apply its result to a different page or owner. Native
context menus and shortcuts provide those same page operations while ordinary
website editing keeps its input. A managed website window has its own native
find form rather than targeting the opener's workbench find bar.

## Steps

1. Open two controlled pages with distinct repeated text and editable fields.
   On the selected tab, use **… → Find in page…** and ⌘/Ctrl+F. Expected: find
   opens for that website; match count, next/previous and case matching reflect
   its text. Close find; its selection clears and page interaction resumes.
2. Start a search and navigate or switch the selected page. Expected: stale
   results do not appear for the replacement target. Repeat after tab closure
   and workbench reload.
3. Change page zoom with the menu and native page shortcuts; reset to Actual
   size. Expected: the website changes zoom within the supported range, without
   changing workbench zoom. Do not assume separate zoom for same-origin pages
   where Chromium shares zoom behavior.
4. Choose **Print…**, cancel the ordinary print UI, then open **Inspect page**.
   Expected: the selected website is the print/DevTools target. The workbench
   and an unrelated website are not substituted. Close DevTools.
5. Right-click an HTTP(S) link, an editable field, selected noneditable text and
   a page background. Expected: applicable link opening, editing/Copy and page
   utility items appear. Inspect Element targets the location under the pointer.
6. Repeat Find, Print and Inspect through a managed website window's native
   context menu/shortcuts. Expected: its native find form has Next, Previous and
   Done; counts describe that window and navigation closes the form. Utilities
   do not target the opener tab.
7. Exercise ordinary copy/paste and an available IME while page input is focused.
   Expected: page editing and selected workbench shortcuts do not duplicate or
   consume one another's actions. Record exactly which input paths were tested.

## Notes

Headless utility tests do not verify native printing, DevTools presentation,
keyboard/IME routing or context-menu focus. This manual case remains untested.
