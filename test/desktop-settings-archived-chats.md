---
id: TC-DESKTOP-SETTINGS-005
title: Archived chats restore from settings without model startup
module: desktop
area: settings
tags: [desktop, settings, chats, archive, recovery]
status: untested
severity: medium
date: 2026-11-15
updated: 2026-11-15
automatable: false
covered_by:
  - editor/lib/desktop/settings-archives.test.ts
  - desktop/src/main/native-archives.test.ts
  - desktop/src/main/native-archive-ipc.test.ts
  - desktop/src/main/native-desktop-archives.test.ts
  - crates/grida-agent/tests/process/catalog.rs
---

## Behavior

Settings lists archived chats with their workspace and restores them through a
metadata operation. It does not load a chat, resume work or require a model
connection. Restored chats disappear from the archive and return to their
workspace's active picker.

## Steps

1. Launch `just desktop` normally, without a native test-profile flag. Using
   disposable local workspaces, archive chats in two workspaces. Include a chat
   with a removed provider and a workspace with no active native worker.
2. Open Settings → Archived chats. Confirm titles and workspace labels appear
   with Unarchive actions, and no provider connection/model work starts.
3. Unarchive a chat. Confirm it disappears from the archive, Settings stays
   open and the chat is not automatically opened or resumed.
4. Return to its workspace and open the chat picker. Confirm it is listed
   among active chats. Confirm archived browsing/restoration is absent there.
5. Change an archive's catalog revision in another fixture client, then use
   the stale Settings action. Confirm an understandable error/refreshed state
   without changing a different chat or overwriting newer metadata.
6. Exercise empty, paginated and native-unavailable states. Confirm controls
   remain usable, retries do not duplicate rows, and child/private sessions
   that are not catalog entries are not exposed.
