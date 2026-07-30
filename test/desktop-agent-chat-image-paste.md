---
id: TC-DESKTOP-AGENT-CHAT-001
title: Paste a clipboard image into the agent composer
module: desktop
area: agent-chat
tags: [agent-chat, composer, image, paste, multimodal, vision]
status: untested
severity: high
date: 2026-06-07
updated: 2026-07-30
automatable: false
covered_by:
  - editor/kits/composer/composer-transfer.test.ts
  - editor/lib/agent-chat/image-attachment.test.ts
  - editor/lib/agent-chat/input-resource-router.test.ts
  - packages/grida-ai-agent/src/http/routes/agent.test.ts
  - packages/grida-ai-agent/src/runtime/runtime.live.test.ts
---

## Behavior

Pasting a copied image into the desktop agent composer gives the agent two
representations of one attachment:

- a bounded, possibly resized/transcoded base64 `file` part, so a vision model
  sees the pixels immediately; and
- the byte-exact original staged into session scratch, plus a descriptor naming
  its scratch-relative path, so filesystem and shell tools can operate on it.

Immediate perception and tool addressability are complementary rather than
mutually exclusive. If scratch is unavailable or its bounded seed budget is
full, provider-native perception remains the fallback.

A pasted image must NOT be inserted as text (no base64 blob in the editor): the
composer intercepts image clipboard data and turns it into an attachment chip
instead.

## Steps

1. Open the desktop app, open a workspace, focus the agent composer.
2. Take a screenshot to the clipboard (macOS **⌘⇧Ctrl+4**) of something with an
   obvious, nameable feature (e.g. a red shape, a word).
3. Paste with **⌘V** into the composer.
   - Expected: an image **thumbnail chip** appears above the toolbar (with a
     hover "remove" ✕). No base64 text is inserted into the editor.
4. Type "what's in this image?" and send.
   - Expected: the model's reply describes the actual image content (the
     specific shape/word), proving it saw the pixels — not a generic guess.
5. Send: "Use the attachment's scratch path to make a byte-for-byte copy named
   `pasted-copy.png`, then report its byte count."
   - Expected: the agent uses the scratch path from the attachment descriptor;
     the copy exists and it does not ask the user to save or attach the image
     again.
6. Without attaching anything, send a follow-up: "describe it again in one line."
   - Expected: the model still references the same image (durability — it was
     persisted and re-sent from the DB on this turn).

## Notes

- Encoding/policy: `editor/lib/agent-chat/image-attachment.ts`
  (`encodeImageFile`, downscale to ~1568px / ~5 MB, PNG→JPEG ladder).
- Paste/drop enters through `ComposerContent.onTransfer`; `ComposerTransfer`
  preserves the gesture provenance and original browser files. The desktop
  wiring and chip render are in
  `editor/scaffolds/desktop/shared/agent-composer-input.tsx`.
- The model→image round-trip (incl. multi-turn + resume) is automated against a
  real model in `packages/grida-ai-agent/src/runtime/runtime.live.test.ts`
  (gated `GRIDA_LIVE_AGENT=1`); this TC covers the UI gesture that test can't.
- Dual routing, raw-byte preservation, scratch budgeting, and provider-only
  fallback are automated in `input-resource-policy.test.ts` and
  `input-resource-router.test.ts`; the clipboard gesture and rendered chip
  remain manual.
- A server-side size guard rejects inline images >~8 MB before persistence
  (`run-input.ts` `normalizeWireParts`).
