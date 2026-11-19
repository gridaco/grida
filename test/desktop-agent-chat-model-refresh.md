---
id: TC-DESKTOP-AGENT-CHAT-029
title: Model choices refresh when opened and after returning from Settings
module: desktop
area: agent-chat
tags: [agent-chat, models, providers, settings, focus]
status: untested
severity: medium
date: 2026-11-15
updated: 2026-11-15
automatable: false
covered_by:
  - editor/scaffolds/desktop/workbench/native-chat-controls.test.tsx
  - editor/scaffolds/desktop/workbench/native-chat-focus.browser.tsx
  - editor/lib/agent-chat/native-chat-controller.test.ts
---

## Behavior

Home and workspace composers show a compact loading placeholder until the
initial catalogue and selection are known. A failed first read offers Retry in
the toolbar. A loaded empty catalogue can still resolve to Default model. The
draft stays editable through these transitions.

Model choices stay current without a permanent refresh button. Entering the
model list reloads its choices; opening the chat's effort settings alone does
not. Returning to the Welcome or chat window after changing providers in
Settings reloads the choices as well. The current model and unsent message stay
selected while choices reload. A reload failure preserves the previous choices
and offers a compact Retry action inside the model list.

For an explicit current connection, the list opens with up to five of that
connection's models, including the selected model. Show all models reveals
the full catalogue grouped by provider and Default. The expanded list stays
open until leaving or closing the picker.
Manage models opens or focuses the native Desktop Settings window from the
expanded list, like Cmd+Comma, leaving the chat in its original window. Older
native builds without this action do not offer Manage models.
Search always covers every connection, and clearing it restores the chosen
list view. Without a known current connection, the full list appears.

## Steps

1. Run Desktop with the authenticated local development setup and at least one
   configured model connection. Open the Welcome model picker.
2. Expected: the searchable model list appears with no Refresh models footer.
   Close and reopen it; its choices reload without changing the selected model.
3. Open a workspace chat and prepare an unsent message. Open its model picker.
4. Expected: the effort panel appears with no refresh footer. Enter the model
   list using the model name; its choices reload and the draft is preserved.
5. Open Settings in another window and add or remove a provider connection, or
   change the models registered for a custom endpoint. Return to the chat.
6. Expected: the model list reflects the saved settings without a manual
   refresh. The chat's model is not silently switched. Repeat from Welcome.
7. Make the catalogue read fail using a controlled host fixture, then reopen
   the model list.
8. Expected: previous choices remain visible and a compact error with Retry
   appears. The effort panel does not show that retry action.
9. Restore the catalogue read and select Retry.
10. Expected: choices update, the error disappears, and the existing selection
    and draft are preserved. Opening the list while a focus-triggered reload
    is pending shares the same read rather than launching duplicate requests.
11. Select a ChatGPT subscription model with other providers also configured,
    then reopen the model list. Confirm only up to five subscription models
    appear, including the selected model, under ChatGPT Subscription.
12. Use Show all models. Confirm each provider has its own heading and its
    models together underneath, with Default above the provider groups. Confirm
    there is no Show fewer models action. Close and reopen the picker to return
    to the shortlist without changing models.
13. From the shortlist, search for a model from another provider. Confirm it
    appears under its provider heading without needing Show all models; clear the search and confirm
    the shortlist returns. Repeat after expanding the full list and confirm
    clearing search keeps the full list. Confirm an unmatched search shows a
    helpful empty message, and keyboard navigation can reach Show all models.
14. Select a model beyond the first five of its connection and reopen the list.
    Confirm it remains visible and checked. Selecting it returns to effort in
    the same popup. Close and reopen; the model list starts compact again.
15. After selecting a non-default Gateway model or another provider, use Show
    all models again. Confirm Gateway and the other configured connections
    remain listed; catalogue refresh must not depend on a default-model
    worker still running. Confirm the current selection and draft remain.
16. With an unsent draft, open Show all models and select Manage models.
    Confirm the picker closes and Desktop Settings opens in a separate window.
    Confirm the chat and draft remain in their original window. Select Manage
    models again and confirm the existing Settings window is focused rather
    than duplicated. Compare with Cmd+Comma; it should focus that same window.
