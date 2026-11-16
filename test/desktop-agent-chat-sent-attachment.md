---
id: TC-DESKTOP-AGENT-CHAT-020
title: Sent images stand alone and other attachments keep separate cards
module: desktop
area: agent-chat
tags: [agent-chat, attachment, image, preview, history]
status: untested
severity: medium
date: 2026-11-13
updated: 2026-11-16
automatable: partial
covered_by:
  - crates/grida-agent/tests/process/images.rs
  - desktop/src/main/native-agent-process.test.ts
  - editor/lib/agent-chat/native-message-parts.test.ts
  - editor/scaffolds/desktop/workbench/native-attachment-card.test.tsx
---

## Behavior

A sent request shows its attachments outside the text bubble, with no
placeholder text in the message. A supported image shows only the image,
without a card frame, filename or dimensions caption, and opens a full image
preview. Files, folders and videos keep individual cards. An explicitly attached
raster is read from the owning chat's exact retained original, including after
reopening; the model may have received a bounded derivative. A referenced
video can show and enlarge a retained still; this does not read the source
path or promise video playback. Previewing does not change model perception
or grant filesystem access.

Unsupported files, including PDF, SVG and HTML, keep honest named file cards.
A folder card has no size or preview. An older binary without retained-image
reading keeps a plain card; an unavailable image must not show another input
or a broken thumbnail. A request with an attachment cannot be edited and
resubmitted, so it offers no Edit action; nor does a request that started a
goal.

## Steps

1. In a native workspace chat on a model that accepts images, attach a PNG
   and send a short request about it.
2. Confirm the sent PNG appears outside the text bubble as just the image,
   without a card frame, filename, dimensions caption or `[Retained PNG image]`
   placeholder.
3. Select the image preview.
   - Expected: the retained PNG opens fitted to the window; zoom, pan, Copy,
     Download, Escape and Close follow TC-DESKTOP-AGENT-CHAT-007. Opening it
     starts no model turn and changes no draft.
4. Reload the window and reopen the chat.
   - Expected: the correct original image remains previewable without
     another inference, including when the current model cannot take images.
5. Send a second, visibly different PNG with the same filename. Preview each
   sent image again.
   - Expected: each opens its own original image; filename equality does not
     substitute the latest attachment for an earlier one.
6. Attach a JPEG larger than the prepared-model limit, then a video in a
   separate message, and reopen the chat.
   - Expected: the JPEG previews the exact retained original, even if model
     preparation resized it. The video keeps its individual poster card;
     enlarging that poster neither reads the original path nor plays video.
7. Send a generic text file, PDF, SVG and HTML in separate messages, then a
   folder reference.
   - Expected: each has its own file or folder card outside the text bubble,
     without an invented preview; the folder has no size or access-grant claim.
8. Use a fixture whose native binary lacks the input-image read capability.
   - Expected: the retained PNG has a plain named card. If a supported reader
     reports an image unavailable, no unrelated image or broken thumbnail is
     substituted.
9. Hover the attached message. Confirm Copy is offered and Edit is not.
   Hover an earlier plain-text request in the same chat and confirm Edit is
   offered there.

## Verification

The image-only and separate-file-card layout, click-to-preview, image identity
after reopen and model changes, fallback presentation and preview controls are
pending human QA. Existing process and mapping tests cover only their exercised ownership
and projection contracts. Overall status remains untested.
