---
id: TC-DESKTOP-ONBOARDING-001
title: First run introduces Grida and offers ChatGPT Subscription
module: desktop
area: onboarding
tags: [chatgpt, oauth, artwork, first-run, workspace]
status: untested
severity: high
date: 2026-07-28
updated: 2026-07-28
automatable: false
covered_by:
  - desktop/src/main/desktop-entry-window.test.ts
  - desktop/src/main/protocol-router.test.ts
  - desktop/src/window.test.ts
  - editor/app/desktop/onboarding/page.test.tsx
  - editor/lib/desktop/chatgpt-subscription.test.ts
---

## Behavior

When no active Grida account session exists, the Desktop entry window opens on
required sign-in. After authentication, that same window continues through
three short onboarding steps when setup is incomplete: Welcome, ChatGPT, and
Workspace. Sign-in, onboarding, and the normal workstation are mutually
exclusive full-window surfaces in one canonical entry window. The compact
sign-in and onboarding surfaces have no titlebar divider.
Each onboarding step has dedicated generated artwork. The artwork carries no
text badge; the official OpenAI logo appears on the ChatGPT sign-in action. The
flow has no Back action.

Grida account authentication keeps the same compact geometry after onboarding
is complete. ChatGPT sign-in opens the system browser and returns to a connected
state in the same step. The flow never exposes credentials to the renderer,
never invokes ACP, and never blocks the user from continuing without ChatGPT. A
folder opened during onboarding becomes the welcome composer's active
workspace. Completing the Workspace step records host onboarding completion,
changes the same entry window to normal workstation dimensions, and enters
Welcome.

## Steps

1. Start an Insiders Desktop build with native onboarding completion reset and
   no active Grida account session.
2. Expected: the canonical entry window opens in its compact presentation on
   `/desktop/auth/sign-in`, with no continuation query. The normal Welcome
   composer is not present behind or beneath it, and the empty titlebar has no
   bottom divider.
3. Sign in to Grida in the system browser.
4. Expected: the same compact entry window continues to
   `/desktop/onboarding`. No second entry window is created. Closing or failing
   authentication does not expose onboarding. The artwork reaches behind the
   drag region without a titlebar divider. Authenticated onboarding is not
   shown until the local agent sidecar is ready.
5. Expected: **Welcome to Grida Desktop** appears with the vivid Grida artwork
   and a centered **Continue** button. No progress indicator, badge, **Back**,
   or dialog frame is visible.
6. Select **Continue**.
7. Expected: **Connect ChatGPT** appears with its dedicated ChatGPT artwork and
   the appropriate connection state.
   While disconnected, the primary action is centered above **Skip**, which
   uses a link treatment. No progress indicator or **Back** action is visible.
8. When signed out, select the OpenAI-logo **Continue with ChatGPT** button.
9. Expected: the system browser opens the ChatGPT sign-in flow. The step shows
   **Finish signing in in your browser** and **Cancel sign-in**.
10. Complete sign-in in the browser and return to Grida.
11. Expected: the step shows **ChatGPT connected**, the account label when
    available, and **Continue**. **Skip** is no longer visible.
12. Select **Continue**.
13. Expected: **Choose a workspace** shows its dedicated folder artwork, the
    managed default workspace, and **Open another folder…**.
    A centered **Start creating** primary action appears below the body. No
    progress indicator, **Skip**, or **Back** is visible.
14. Open another folder, then select **Start creating**.
15. Expected: the same entry window grows to the normal workstation size and
    navigates to Welcome with the opened folder as the active workspace. No
    second Welcome window is created, and browser Back cannot return to
    onboarding.
16. Reset onboarding and repeat the flow without connecting ChatGPT. Select
    **Skip** on the ChatGPT step, then select **Start creating** on the
    Workspace step.
17. Expected: onboarding finishes and Grida stays usable with the default
    workspace and any configured text provider.
18. Resize the onboarding window to its compact supported size and switch
    between light and dark themes.
19. Expected: the artwork remains legible and crop-safe, the body can scroll,
    and every action remains reachable.

## Notes

- The same-origin artwork assets `/onboarding/welcome.webp`,
  `/onboarding/chatgpt.webp`, and `/onboarding/workspace.webp` must load under
  the Desktop CSP.
- The official OpenAI logo is rendered on the ChatGPT sign-in button rather
  than baked into the raster.
