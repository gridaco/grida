---
id: TC-DESKTOP-AGENT-CHAT-010
title: Drop a generic file into the agent composer
module: desktop
area: agent-chat
tags: [agent-chat, composer, file, drag-drop, scratch]
status: verified
severity: high
date: 2026-07-30
updated: 2026-07-30
automatable: false
covered_by:
  - editor/lib/agent-chat/input-resource-router.test.ts
  - packages/grida-ai-agent/src/http/routes/agent.test.ts
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

## Notes

- `InputResourceRouter` classifies supported raster types with
  `isSupportedImageType`; `image/svg+xml` is deliberately excluded.
- File classification and scratch lowering are covered by
  `input-resource-router.test.ts` and the agent route tests; the Finder gesture
  and rendered chip remain manual.
- 2026-07-30: Manually verified in local Grida Desktop with plain text and SVG.
  Both used the generic file route and were readable from scratch without a
  source path.
