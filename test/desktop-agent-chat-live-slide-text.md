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
  - editor/app/(dev)/ui/components/composer/desktop-demo.browser.tsx
---

## Behavior

An immediate Act message can read or replace the selected plain text on the
active slide. Switching slides withdraws the old target. The edit is visible in
the editor, where Undo and Save apply to that slide. The composer labels the
eligible selection, and the sent message keeps its own label.

## Steps

1. Open a deck with two SVG slides in its file window. Select one plain text
   element. Verify **SVG text selection** appears above the composer input.
   Ask in **Act** to replace its text and verify the label above the sent message.
2. Verify the edit appears in the first slide. Undo it, redo it, and save.
3. Send another Act request on the first slide and switch to a slide with no
   selection before the edit tool runs. Verify the new slide stays unchanged,
   the composer label clears, and the sent message keeps its label when reopened.
4. Send a similar request in **Plan**. Verify the label stays hidden and the
   selected-text edit is unavailable.
