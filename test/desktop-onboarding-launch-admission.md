---
id: TC-DESKTOP-ONBOARDING-003
title: Launch intents wait for authenticated onboarding
module: desktop
area: onboarding
tags: [entry-window, launch-intent, admission, first-run]
status: untested
severity: high
date: 2026-07-28
updated: 2026-07-28
automatable: false
covered_by:
  - desktop/src/main/desktop-entry-window.test.ts
  - desktop/src/main/ipc-admission.test.ts
  - desktop/src/main/startup-window-policy.test.ts
---

## Behavior

Document, workspace, and supported file launches cannot create an auxiliary
window while required sign-in or onboarding owns the entry window. Payloads
that arrive during either role wait until onboarding completes, then enter
through the normal main-role launch path.

## Steps

1. Start Desktop signed out and with onboarding incomplete.
2. While required sign-in is visible, send one supported file-open intent, one
   document launch, and one workspace launch, using a distinct target for each.
3. Expected: none of the three payloads creates an auxiliary window or replaces
   the sign-in surface.
4. Sign in and continue to onboarding, then send another distinct file-open,
   document, and workspace launch.
5. Expected: onboarding remains the only visible entry surface and no
   auxiliary window is admitted.
6. Complete onboarding with **Start creating**.
7. Expected: the canonical entry reaches the main role before the six queued
   payloads are handled. Every file, document, and workspace payload then
   follows its normal launch behavior without a competing sign-in or onboarding
   window.
