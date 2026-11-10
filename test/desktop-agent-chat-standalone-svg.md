---
id: TC-DESKTOP-AGENT-CHAT-013
title: Standalone SVG chat follows the selected document
module: desktop
area: agent-chat
tags: [chat, svg, save, permissions]
status: untested
severity: medium
date: 2026-11-10
updated: 2026-11-10
automatable: true
covered_by:
  - desktop/src/main/native-chat-ipc.test.ts
  - editor/scaffolds/desktop/file/document-surface-host.test.ts
---

## Behavior

A standalone SVG has saved chats scoped to that file. An immediate Act
message can work with the plain text selected at send time. The edit appears
in the editor, where Undo and Save work as usual. A different SVG has its own
chat history. The standalone chat has no grant for the surrounding folder.

## Steps

1. Open an SVG directly in a build with native document chat. Select one
   plain text element and ask in **Act** to replace its text.
2. Check that the text changes in the editor and the title shows unsaved
   changes. Undo the edit, redo it, then save the SVG.
3. Close the window and reopen the SVG from Recent. Choose the saved chat
   and verify that the answer appears without resending the request.
4. Open another SVG directly. Verify the first SVG's conversation is absent.
