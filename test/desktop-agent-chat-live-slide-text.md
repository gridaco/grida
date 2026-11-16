---
id: TC-DESKTOP-AGENT-CHAT-015
title: Act edits the selected text in the active slide
module: desktop
area: agent-chat
tags: [chat, deck, svg, save]
status: untested
severity: high
date: 2026-11-10
updated: 2026-11-10
automatable: true
covered_by:
  - desktop/src/main/native-gateway-svg-text.test.ts
  - editor/scaffolds/desktop/file/document-surface-host.test.ts
---

## Behavior

An immediate Act message can read or replace the selected plain text on the
active slide. Switching slides withdraws the old target. The edit is visible in
the editor, where Undo and Save apply to that slide.

## Steps

1. Open a deck with two SVG slides in its file window. Select one plain text
   element and ask in **Act** to replace its text.
2. Verify the edit appears in the first slide. Undo it, redo it, and save.
3. Send another Act request on the first slide and switch slides before the
   edit tool runs. Verify the new slide stays unchanged.
4. Send a similar request in **Plan**. Verify the selected-text edit is unavailable.
