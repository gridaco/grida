---
id: TC-DESKTOP-ONBOARDING-001
title: First run introduces Grida and offers ChatGPT Subscription
module: desktop
area: onboarding
tags: [chatgpt, oauth, artwork, first-run, workspace]
status: untested
severity: high
date: 2026-07-28
updated: 2026-11-15
automatable: false
covered_by:
  - desktop/src/main/desktop-entry-window.test.ts
  - desktop/src/main/protocol-router.test.ts
  - desktop/src/window.test.ts
  - editor/app/desktop/onboarding/page.test.tsx
  - editor/lib/desktop/chatgpt-subscription.test.ts
  - desktop/src/main/native-desktop-agent.test.ts
  - desktop/src/main/native-subscription-profiles.test.ts
---

## Subscription selection verification

2026-11-15, macOS arm64, ordinary development Desktop 0.0.26: an existing
connected subscription exposed its closed model set in the workspace picker.
Selecting GPT-5.6 Luna started the native Responses worker, and restarting
Desktop restored that selection. A fresh Welcome window recommended GPT-5.6
Sol; explicitly choosing Default remained Default after Refresh models. The
existing OpenRouter conversation retained its connection through the restart.
This interaction check sent no live inference and did not repeat onboarding,
OAuth, sign-out or account replacement. Those parts of this manual case remain
untested. Enabled native-resource tests cover selected-model inference,
rotation, restart, replacement and sign-out with synthetic responses.

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

Grida account authentication keeps the same compact geometry through
onboarding. ChatGPT sign-in opens the system browser and returns to a connected
state in the same step. The flow never exposes credentials to the renderer,
never invokes ACP, and never blocks the user from continuing without ChatGPT.
A launch that does not offer ChatGPT sign-in reports it as not configured: the
step says sign-in is not available and offers only **Skip**, without a network
request. A folder opened during onboarding becomes the welcome composer's active
workspace. Completing the Workspace step records host onboarding completion,
changes the same entry window to normal workstation dimensions, and enters
Welcome.

In ordinary macOS and Linux Desktop, a connected subscription is usable from
Welcome and workspace model selection. Its compatible models appear in a
distinct **ChatGPT Subscription** group. A fresh chat with no saved or explicit
choice prefers the ready subscription; choosing **Default** explicitly keeps
the Grida recommendation. Other explicit, saved or handed-off choices remain
selected when ChatGPT connects. An existing chat keeps its original provider
and funding. Subscription choices and saved chats stay with their exact
subscription connection: sign-out withdraws that connection, and reconnecting
requires choosing it for a new chat. Connecting another account must never
resume a chat using the earlier account's authority.

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
   shown until the local services sidecar is ready.
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

### Use the connected subscription from ordinary Desktop

1. Launch ordinary macOS or Linux Desktop, without a native subscription launch
   flag, and complete onboarding with ChatGPT connected. Open a fresh project
   and leave its model choice untouched.
2. Expected: the Welcome picker has a **ChatGPT Subscription** group containing
   the eight offered compatible models: GPT-6.1 Sol, GPT-6 Astra, GPT-6.1 Terra,
   GPT-6 Luna, GPT-6 Sol and GPT-5.6 Sol, Terra and Luna. The untouched fresh
   chat recommends GPT-6.1 Sol. Open the project chat and confirm the same
   group is available there. Access still depends on the account's plan and
   workspace.
3. Choose another subscription model on Welcome and send a short text prompt.
4. Expected: the project opens with that exact subscription model, submits the
   prompt once, and keeps the selection after reopening the project. Changing
   among compatible subscription models between turns retains the chat and
   its history. The selected subscription supports tools, reasoning and Ultra
   independent review; image input remains unavailable. Follow
   TC-DESKTOP-AGENT-CHAT-027 to verify actual review work and its lifecycle.
5. In a separate fresh project, explicitly choose **Default** or a configured
   key or endpoint model before connecting ChatGPT. Connect or refresh the
   subscription, then return to that project and restart Desktop once.
6. Expected: the explicit choice stays selected. Repeat with a restored saved
   choice and a Welcome handoff. Neither readiness refresh nor a subscription
   connection replaces these choices.
7. Open an existing Grida-funded or local-key chat, then connect ChatGPT or
   choose a subscription model.
8. Expected: connecting alone leaves the chat's provider unchanged. An explicit
   subscription selection cannot continue the old chat under subscription
   funding; start a new chat to use that connection.
9. With a subscription chat saved, sign out of ChatGPT. Reconnect the same
   account, then repeat with another account if one is available.
10. Expected: the old subscription selection cannot silently start or continue
    work. The new connection requires a fresh selection, and cannot reopen the
    old chat's authority. Reopening the old chat and refreshing models do not
    send a provider request. A new chat can use the newly selected connection.
11. Open a workspace with a saved GPT-5.5 or GPT-5.4 subscription choice from an
    earlier build, then refresh models and restart Desktop.
12. Expected: the withdrawn choice remains visible as unavailable and receives
    no inference. Neither refresh, restart nor the GPT-6.1 Sol recommendation
    replaces it. Choose an available subscription model explicitly to use a
    replacement; the account connection and funding remain the user's choice.

## Verification

2026-11-15, macOS arm64: the refreshed native-resource suite in
`desktop/src/main/native-subscription-profiles.test.ts` passed all five cases
against rebuilt and staged native binaries. Synthetic ordinary Desktop
composition exposed eight compatible models with GPT-6.1 Sol as the
recommendation. Mixed saved selections retained withdrawn GPT-5.5 and GPT-5.4
as unavailable; selecting them failed without inference, fallback or replacing
the active owner. The existing exact-model dispatch, High reasoning,
credential rotation, saved-chat restart, changed-lineage refusal, sign-out
and actual Ultra reviewer checks also passed. No external provider call was
made.

The recorded subscription selection checks above preceded the refreshed
membership and GPT-6.1 Sol default. The eight-model picker, new default and
withdrawn-choice scenarios still require manual UI verification; earlier UI
checks do not establish these outcomes. The five-case suite establishes only
the automated host and native-process evidence described here.

The ordinary-launch picker, selection persistence, funding separation and
reconnection scenarios above are pending manual verification. The historical
OAuth smoke recorded in `desktop/docs/chatgpt-subscription-oauth.md` predates
the native cutover and does not verify these scenarios. Automated synthetic
provider tests establish their covered contracts only; they do not certify a
live subscription turn or the composed UI flow.

## Notes

- The same-origin artwork assets `/onboarding/welcome.webp`,
  `/onboarding/chatgpt.webp`, and `/onboarding/workspace.webp` must load under
  the Desktop CSP.
- The official OpenAI logo is rendered on the ChatGPT sign-in button rather
  than baked into the raster.
- Steps that send a live subscription prompt can consume plan quota. Picker,
  restart and sign-out checks can be performed before sending one.
