---
id: TC-DESKTOP-AGENT-CHAT-021
title: Explicit raster attachments send pixels and preserve source identity
module: desktop
area: agent-chat
tags: [agent-chat, composer, image, paste, drag-drop, screenshot, multimodal]
status: untested
severity: high
date: 2026-11-13
updated: 2026-11-16
automatable: partial
covered_by:
  - editor/lib/agent-chat/native-chat-controller.test.ts
  - desktop/src/main/native-selected-images.test.ts
  - desktop/src/main/native-agent-selected-images.test.ts
  - crates/grida-agent/tests/process/raster_images.rs
---

## Behavior

Explicit PNG, JPEG, WebP and GIF attachments carry prepared pixels in the first
request on a compatible image model, including a supported ChatGPT subscription
connection. A disk image also supplies its verified source path. A clipboard
image without a disk origin has a truthful retained-snapshot identity.
Original bytes, bounded model pixels and the UI preview remain distinct.

Large supported sources can be resized; animation supplies one still frame.
Malformed or oversized input and a text-only model preserve the whole draft,
without sending its text alone or silently changing the image to a path-only
reference. One attachment is accepted at a time.

## Steps

1. In a subscription image-model chat, drop a JPEG photo from outside the
   project, add “Describe what you see and identify its source,” and send.
   Expected: the reply describes the image and can identify its selected disk
   path. The sent image stands alone outside the text bubble.
2. Repeat with a pasted screenshot that has no disk origin. Expected: eager
   image understanding still works; the agent does not invent an original
   file path. Repeat once with WebP or GIF; a GIF is described as one still.
3. Attach a valid image larger than 256 KiB but within the 20 MiB source and
   decode bounds. Expected: it remains an image, with bounded preparation
   rather than the legacy size rejection. Ask for a crop and confirm its
   dimensions reflect the prepared view, which can be smaller than the source.
4. Keep text and an image in the composer, select a text-only model and send.
   Expected: the whole draft stays unsent. Choose a compatible model and retry;
   it accepts once and uses the intended image.
5. Open a sent image, restart Desktop and reopen it. Expected: the retained
   original remains previewable without another inference. Preview success
   alone is not proof of model perception.
6. Try malformed pixels, a source above 20 MiB, and two simultaneous files.
   Expected: a clear refusal preserves the existing draft and attachment.

## Verification

Native synthetic-provider cases verify first-request JPEG pixels and source
path, bounded raster formats, immutable retained originals and next-request
tool image content. Main and controller tests cover custody, typed input and
draft preservation. The complete Finder/clipboard flow and visual result remain
untested by a human; status stays untested. After interaction QA, inspect the
latest chat's actual record rather than inferring perception from its preview.
