---
id: TC-DESKTOP-AGENT-CHAT-003
title: Drag a macOS screenshot floating-thumbnail into the agent composer
module: desktop
area: agent-chat
tags: [agent-chat, composer, image, drag-drop, macos, screenshot, sandbox]
status: untested
severity: high
date: 2026-06-07
updated: 2026-06-07
automatable: false
covered_by: []
---

## Behavior

When you take a macOS screenshot, a **floating thumbnail** appears bottom-right
for a few seconds. You can drag that thumbnail directly into an app before it
saves. Its backing file lives under a system temp path
(`/var/folders/.../T/TemporaryItems/...`), OUTSIDE any workspace.

Dragging it into the agent composer must attach it like any other image: the
renderer reads the **bytes** off the drop event and inlines them — it must NOT
try to resolve/read the `/var/folders/...` path through the workspace agent fs
(which would reject it as outside the workspace, GRIDA-SEC-004).

**This is the one genuinely-uncertain case** and the reason it gets its own TC:
under macOS app sandboxing/Seatbelt, faulting in the bytes of a
`TemporaryItems`-backed drag promise can fail. If the chip renders with a
visible thumbnail, the bytes faulted in successfully. If nothing attaches (or
the chip is blank/broken), the renderer could not read the promised file — that
is the failure mode to capture here. **Run this case early.**

## Steps

1. Open the desktop app, open a workspace, focus the agent composer.
2. Take a screenshot (**⌘⇧4**, select a region). The floating thumbnail appears
   bottom-right. Do NOT click it (that would save/open it).
3. Drag the floating thumbnail directly onto the composer and drop.
   - Expected: a thumbnail chip appears (bytes read from the drop).
   - Failure to capture: no chip, blank chip, or a console error about reading
     the dropped file — means the sandbox blocked the byte fault-in.
4. Send "what's in this screenshot?" → the model describes its content.

## Notes

- Mechanically identical to TC-DESKTOP-AGENT-CHAT-002; only the _source_ (a
  temp-backed drag promise) differs, which is what makes the sandbox behavior
  worth verifying explicitly.
- The path is never handed to the agent — inline/perceive-only by design, so the
  `/var/folders` location is irrelevant to the agent fs boundary.
- If this fails, the fallback is the clipboard path: **⌘⇧Ctrl+4** copies the
  screenshot to the clipboard, then paste (TC-DESKTOP-AGENT-CHAT-001), which
  never touches a temp file.
