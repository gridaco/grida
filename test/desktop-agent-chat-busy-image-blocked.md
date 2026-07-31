---
id: TC-DESKTOP-AGENT-CHAT-005
title: Attachment submit is blocked while the session is busy (queue is text-only)
module: desktop
area: agent-chat
tags: [agent-chat, composer, attachment, image, queue, multimodal]
status: untested
severity: medium
date: 2026-06-07
updated: 2026-07-30
automatable: false
covered_by:
  - editor/lib/agent-chat/turn-queue.test.ts
  - editor/lib/agent-chat/use-turn-queue-controller.test.ts
---

## Behavior

Submitting while the session is busy **enqueues** an ordinary text message (RFC
`queue`). The turn queue persists **text only**, so provider-native files,
scratch uploads, and other out-of-band attachment context cannot ride a queued
send in v1. When the user tries to submit any such attachment while the session
is busy, the composer **blocks** the submit, shows a one-line notice, and —
crucially — does **not** clear the draft. The user keeps the attachment and text
and can send them once the session becomes idle.

Text-only submits while busy still enqueue normally (unchanged behavior).

## Steps

1. Open the desktop app, open a workspace, focus the agent composer.
2. Send a prompt that produces a long-running reply so a turn is actively
   streaming (the round button shows Stop).
3. While it streams, paste/drop an image (chip appears), type some text, and
   press Enter / click Send.
   - Expected: "Can't send attachments while the session is busy — wait until
     it's idle." The message is NOT sent, and the image chip + text REMAIN in
     the composer.
4. While it still streams, submit **text only** (remove the image first, or use
   a fresh empty composer).
   - Expected: the text message enqueues normally (appears in the queued tray).
5. Wait for the streaming turn to finish (session idle), then send the
   image+text from step 3.
   - Expected: it sends now; the model sees the image.

## Notes

- Block + no-clear logic: `agent-composer-input.tsx` `submit()` guards on
  `isBusy && hasOutOfBandResources`; `composer.clear()` is skipped on the
  blocked path so the complete draft survives.
- The queue carrying text only is intentional for v1 — queued attachment sends
  are a deferred enhancement (`use-turn-queue-controller.ts` enqueue path).
- The listed automated coverage verifies busy-state queue selection and the
  text-only queue boundary. The composer notice, blocked submit, and preserved
  draft remain manual.
- Provider perception is independent of this guard. A raster unsupported by the
  selected provider may still be operable through scratch; either representation
  remains out-of-band and therefore cannot enter the text queue.
