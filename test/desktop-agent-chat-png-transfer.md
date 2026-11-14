---
id: TC-DESKTOP-AGENT-CHAT-021
title: Paste or drop one PNG into native chat
module: desktop
area: agent-chat
tags: [agent-chat, composer, image, paste, drag-drop, screenshot, multimodal]
status: untested
severity: high
date: 2026-11-13
updated: 2026-11-13
automatable: false
covered_by:
  - editor/lib/agent-chat/native-chat-controller.test.ts
---

## Behavior

Pasting or dropping a PNG into the native agent composer attaches it as the
message's one attachment, the same as **Add PNG**. The bytes come from the
clipboard or drop event, so a file outside the workspace, such as a macOS
screenshot thumbnail, works without exposing its path. Another raster format
is refused with a request to use a PNG, and dropping several files at once
asks for one file at a time. A refused transfer keeps any attachment already
in the draft.

## Steps

1. Open Desktop, open a workspace, and focus the native agent composer on a
   connection that accepts PNG input.
2. Copy a PNG under 256 KiB and paste it with **⌘V**.
   - Expected: an attachment card appears and no image text enters the draft.
3. Remove it. Take a screenshot and drag its floating thumbnail onto the
   composer before it saves.
   - Expected: an attachment card appears for the screenshot.
4. Drop a JPEG onto the composer.
   - Expected: the composer asks for a PNG and keeps the screenshot.
5. Drop two PNG files at once.
   - Expected: the composer asks to attach one file at a time.
6. Type "What is this?" and send.
   - Expected: the reply describes the screenshot.

## Notes

- A screenshot over 256 KiB is refused as in TC-DESKTOP-AGENT-CHAT-009.
- The controller test covers the one-file, PNG-only and explicit replacement
  rules; reading a screenshot thumbnail's bytes remains manual.
