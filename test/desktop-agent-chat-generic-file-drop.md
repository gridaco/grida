---
id: TC-DESKTOP-AGENT-CHAT-010
title: Drop a generic file into the agent composer
module: desktop
area: agent-chat
tags: [agent-chat, composer, file, drag-drop, scratch]
status: verified
severity: high
date: 2026-07-30
updated: 2026-11-13
automatable: false
covered_by:
  - editor/lib/agent-chat/native-chat-controller.test.ts
  - crates/grida-agent/tests/process/retained_files.rs
---

## Behavior

A dropped file that is not a supported raster, including plain text and SVG,
uses the generic operable-file route. It renders as a file attachment rather
than a raster preview, and a workspace-bound agent can read its staged bytes
from session scratch without receiving the source operating-system path.

## Steps

1. Open the desktop app, open a workspace, and focus the agent composer.
2. From Finder, drop a plain `.txt` file with distinctive known contents.
   - Expected: a generic file chip appears, not a raster thumbnail.
3. Send a prompt asking the agent to read the attached file and quote its
   contents.
   - Expected: the agent reads the scratch-backed file and returns the exact
     contents without asking for its source path.
4. Repeat with an `.svg` file.
   - Expected: it follows the same generic file route and does not render as a
     provider-native raster preview.
5. In the native workspace chat, attach one file and type a draft. Drop two
   files together. Verify the composer asks for one file and keeps the current
   attachment and draft.

## Notes

- `NativeChatController.pickTransferredAttachment` sends a PNG as image input
  and any other file, including SVG, through the generic file route; other
  supported raster types are refused with a notice to use PNG.
- File classification is covered by `native-chat-controller.test.ts` and
  retained-file staging by the process tests; the Finder gesture and rendered
  chip remain manual.
- 2026-07-30: Manually verified in local Grida Desktop with plain text and SVG.
  Both used the generic file route and were readable from scratch without a
  source path.
- 2026-11-10: Headless Chromium with a synthetic native bridge rendered a
  dropped SVG, preserved it and the draft through a rejected batch and an
  unconfirmed send, and retried the same bytes. Pasted PNG used image input.
