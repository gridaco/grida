---
id: TC-DESKTOP-AGENT-CHAT-025
title: Any file attaches; a large or non-PNG file goes by reference
module: desktop
area: agent-chat
tags: [agent-chat, composer, file, drag-drop, reference, permissions]
status: untested
severity: high
date: 2026-11-15
updated: 2026-11-15
automatable: partial
covered_by:
  - editor/lib/agent-chat/native-chat-controller.test.ts
  - desktop/src/bridge/file-reference-request.test.ts
  - desktop/src/main/native-file-reference.test.ts
  - desktop/src/main/native-agent-file-references.test.ts
  - crates/grida-agent/tests/process/file_references.rs
---

## Behavior

Every file is a valid attachment. A PNG of up to 256 KiB, when the chat's
model takes images, and any other file of up to 256 KiB keep their direct
paths. A PNG the model cannot take goes by reference. Any other file, of any type or size,
is attached by reference: the agent receives its name, type, size and
location, never its bytes, and the reference grants nothing. A file inside the
project is named by its project path and the file tools can read it; a file
from elsewhere is named by its absolute path and only sandboxed commands can
read it, as they could before. Grida copies nothing. A file inside Grida's own
data is refused with a message, also through an alias. The same holds in a
side chat tab.

## Steps

1. Open Desktop, open a workspace, and focus the native agent composer.
2. From Finder, drop a 5 MB `.zip` from outside the project, type "What is in
   this archive? Use a command.", and send.
   - Expected: the card shows the name and `ZIP`; no "at most 256 KiB" message
     appears. The agent lists the archive with a command without asking for
     its path.
3. Drop a file of more than 256 KiB from inside the project and ask the agent
   to read its first lines.
   - Expected: the agent reads it with its file tools by its project path.
4. Drop a JPEG photo.
   - Expected: it attaches by reference instead of asking for a PNG.
5. Choose a model that does not take images and drop a small PNG.
   - Expected: it attaches by reference. Pasting a PNG with no location on
     disk shows "<model> can't take images here. Choose a model that supports
     images to attach a PNG."
6. Try to attach a file from the Desktop app's data folder (for example under
   `~/Library/Application Support/` for Grida) and send.
   - Expected: the send is refused with "This file is in Grida's private data
     and can't be attached." and the draft stays.
7. Open a side chat tab and repeat step 2 there.
   - Expected: the same card and result.

## Notes

- The renderer passes only the person's File; the preload resolves its path
  and Main revalidates it (GRIDA-SEC-004, "Chat attachments by reference").
- A pasted file with no location on disk keeps the 256 KiB limit.
