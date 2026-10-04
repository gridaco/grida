---
id: TC-WWW-NAVIGATION-001
title: Mobile navigation scrolls within the drawer
module: www
area: navigation
tags: [mobile, drawer, scrolling]
status: untested
severity: medium
date: 2026-10-04
updated: 2026-10-04
automatable: true
covered_by: []
---

## Behavior

The mobile navigation drawer stays within the visible viewport. Its navigation
links scroll independently so every Features and Resources link can be reached.
The drawer handle and Log in / Get Started actions remain visible while the
links scroll. Scrolling the links must not move the underlying page or dismiss
the drawer midway through the list.

## Steps

1. Open `/home` at a mobile viewport, such as 390 × 844.
2. Open the navigation menu using the hamburger button.
   Expected: the panel stays within the viewport, and both account actions are
   visible at its bottom.
3. Swipe up within the link list until Contact is visible.
   Expected: the list scrolls, the drawer remains open, and the account actions
   stay in place.
4. Swipe down to return to Home.
   Expected: the first links become visible again without scrolling the page
   behind the drawer.
5. Repeat at 320 × 480 and with increased browser text size.
   Expected: every link remains reachable and the account actions are visible.
6. Close the drawer with Escape or by tapping the overlay, then reopen it.
   Expected: navigation remains usable and the page scrolls normally after close.

## Notes

The original drawer capped its height but did not give its overflowing menu a
scroll container. The menu and account actions could extend below the viewport.
