---
title: Tips & host notes
description: Non-normative — a collection of good-to-know practical notes and host/environment gotchas that inform canvas work but do not rise to a spec.
tags:
  - internal
  - wg
  - canvas
format: md
---

**This page is not a specification.** It carries no contracts and binds
nothing. It is a dump for practical, good-to-know notes — host and
environment gotchas, small integration facts — that are worth writing
down but do not belong in an RFC. If an item here ever grows into a real
domain concept, it graduates out of this page into its own spec.

## Swipe-back / host navigation suppression

A canvas hosted inside a browser (or an OS shell that reserves edge
gestures) competes with the host for horizontal overscroll and the
two-finger swipe the host reads as back/forward. Left unclaimed, that
gesture navigates the host away from the editor mid-interaction and
discards in-flight work.

The fix is trivial and host-specific: while the surface is mounted, it
suppresses horizontal overscroll / swipe navigation within its bounds,
and stops doing so when torn down. In a browser this is a one-line
overscroll-behavior claim; on other hosts it is whatever the equivalent
"don't treat my horizontal drags as navigation" affordance is.

It is a browser/host quirk to remember, not a domain behavior — there is
nothing to model, only to not forget.
