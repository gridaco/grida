---
id: TC-DESKTOP-ONBOARDING-002
title: Native preferences remain the onboarding authority
module: desktop
area: onboarding
tags: [migration, preferences, first-run, local-storage]
status: untested
severity: high
date: 2026-07-28
updated: 2026-07-28
automatable: false
covered_by:
  - desktop/src/main/desktop-preferences.test.ts
  - desktop/src/main/desktop-entry-window.test.ts
  - editor/app/desktop/onboarding/page.test.tsx
---

## Behavior

Versioned Desktop preferences are the continuing source of truth for onboarding
completion. An existing 0.0.13 renderer completion flag may migrate exactly
once when no native preference exists, so an upgrade does not repeat
onboarding. After that migration, clearing or rewriting renderer localStorage
cannot change the native decision. The legacy native onboarding file also
migrates once without becoming a second ongoing authority.

## Steps

1. In Desktop 0.0.13, complete or skip onboarding so renderer localStorage
   contains `grida.desktop.onboarding.completed.v1=1`.
2. Keep the Grida account session, ensure no native `preferences.json` exists,
   then launch Desktop 0.0.14.
3. Expected: the legacy renderer completion migrates once and the authenticated
   entry opens Welcome instead of repeating onboarding.
4. Clear renderer localStorage, then reload and relaunch Grida.
5. Expected: onboarding stays absent because native preferences remain
   authoritative. Unrelated renderer-only UX state may return to its default.
6. Explicitly reset native onboarding completion, then manually restore the
   obsolete renderer key to `1` and relaunch.
7. Expected: onboarding appears. The already-consumed renderer key cannot
   complete or suppress the flow again.
8. In a separate clean profile, create the legacy native `onboarding.json`
   completion file and leave `preferences.json` absent.
9. Expected: completion migrates into versioned Desktop preferences once.
   Removing the legacy file and relaunching does not change the result.
