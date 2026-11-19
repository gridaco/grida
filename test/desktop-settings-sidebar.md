---
id: TC-DESKTOP-SETTINGS-003
title: Desktop settings categories use sidebar navigation
module: desktop
area: settings
tags: [desktop, settings, sidebar, navigation]
status: untested
severity: medium
date: 2026-11-15
updated: 2026-11-15
automatable: false
covered_by:
  - editor/lib/desktop/settings-navigation.test.ts
  - editor/scaffolds/desktop/workbench/native-chat-controls.test.tsx
---

## Behavior

Settings keeps categories in a sidebar and opens in a dedicated native window.
Switching categories preserves the calling chat. Provider deep links select the
category containing their destination. Hooks and archived-chat management live
in Settings rather than chat menus.

## Steps

1. With an unsent workspace-chat draft, open Settings using Command+Comma.
2. Confirm sidebar categories include Account, Appearance, Credits, LLM Providers, Media
   Providers, Hooks, Archived chats and About. Select each category and confirm
   its content changes while navigation remains available.
3. Resize Settings to its supported minimum size. Confirm navigation and form
   controls remain reachable and content scrolls within the window.
4. Open existing provider links such as provider-elevenlabs and provider-tripo.
   Confirm Media Providers is selected and the intended provider is visible.
5. Focus the chat and use Command+Comma again. Confirm the same Settings window
   is focused. Return to the chat and confirm its draft is intact.
   In Appearance, select Dark and Light and confirm the UI updates. Select
   System and confirm it follows the operating system. Confirm the preference
   survives reopening Settings and is reflected in other Desktop windows.
6. Open chat options and the chat picker. Confirm neither offers lifecycle-hook
   management nor archived-chat browsing/restoration. **Archive** remains an
   action for an active chat.
