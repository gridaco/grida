---
id: TC-DESKTOP-ONBOARDING-004
title: Sign-out resets onboarding and compact entry geometry
module: desktop
area: onboarding
tags: [sign-out, entry-window, geometry, preferences]
status: untested
severity: high
date: 2026-07-28
updated: 2026-07-28
automatable: false
covered_by:
  - desktop/src/main/desktop-entry-window.test.ts
  - desktop/src/main/desktop-preferences.test.ts
  - desktop/src/window.test.ts
---

## Behavior

Explicit Grida sign-out clears the authenticated role and resets native
onboarding completion. The canonical entry window immediately returns to the
compact sign-in presentation. After the next successful sign-in, that same
window enters compact onboarding before it can return to normal workstation
geometry. A session that merely expires preserves completed onboarding.

## Steps

1. Complete onboarding and open Settings from the normal workstation.
2. Sign out of Grida.
3. Expected: Settings closes and the canonical entry window shows centered
   compact sign-in, not a workstation-sized surface or a second window.
4. Close and relaunch the app while still signed out.
5. Expected: the same compact sign-in role and geometry are selected.
6. Complete Grida sign-in.
7. Expected: explicit sign-out has reset native onboarding completion, so the
   same compact entry window enters onboarding rather than Welcome.
8. Complete onboarding.
9. Expected: the canonical window grows to normal workstation dimensions and
   auxiliary windows become available.
10. In a separate completed profile, expire or remove only the Grida session
    without using the explicit sign-out action, then sign in again.
11. Expected: completed onboarding is preserved and the entry returns directly
    to the normal Welcome presentation.
