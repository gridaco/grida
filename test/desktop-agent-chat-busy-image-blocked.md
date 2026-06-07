---
id: TC-DESKTOP-AGENT-CHAT-005
title: Image submit is blocked while a turn is streaming (queue is text-only)
module: desktop
area: agent-chat
tags: [agent-chat, composer, image, queue, multimodal]
status: untested
severity: medium
date: 2026-06-07
updated: 2026-06-07
automatable: false
covered_by: []
---

## Behavior

Submitting while a turn is streaming **enqueues** the message (RFC `queue`). The
turn queue persists **text only**, so image attachments cannot ride a queued
send in v1. When the user tries to submit with an image attached while the
session is busy, the composer **blocks** the submit, shows a one-line notice,
and — crucially — does **not** clear the attachments, so the user keeps their
image and can send it once the turn finishes.

Text-only submits while busy still enqueue normally (unchanged behavior).

## Steps

1. Open the desktop app, open a workspace, focus the agent composer.
2. Send a prompt that produces a long-running reply so a turn is actively
   streaming (the round button shows Stop).
3. While it streams, paste/drop an image (chip appears), type some text, and
   press Enter / click Send.
   - Expected: a one-line notice like "Can't queue images — wait for the current
     turn." The message is NOT sent, and the image chip + text REMAIN in the
     composer.
4. While it still streams, submit **text only** (remove the image first, or use
   a fresh empty composer).
   - Expected: the text message enqueues normally (appears in the queued tray).
5. Wait for the streaming turn to finish (session idle), then send the
   image+text from step 3.
   - Expected: it sends now; the model sees the image.

## Notes

- Block + no-clear logic: `agent-composer-input.tsx` `submit()` (guards on
  `isStreaming && files.length > 0`); `composer.clear()` is skipped on the
  blocked path so attachments survive.
- The queue carrying text only is intentional for v1 — queued image sends are a
  deferred enhancement (`use-turn-queue-controller.ts` enqueue path).
- Capability note: every catalogued model is currently `multimodal: true`, so
  the "non-vision model rejects images" path is covered by unit logic
  (the `multimodal` gate in the composer) rather than a manual TC; add one if a
  text-only model ships.
