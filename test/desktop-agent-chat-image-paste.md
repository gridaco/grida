---
id: TC-DESKTOP-AGENT-CHAT-001
title: Paste a clipboard image into the agent composer (perceive-only)
module: desktop
area: agent-chat
tags: [agent-chat, composer, image, paste, multimodal, vision]
status: untested
severity: high
date: 2026-06-07
updated: 2026-06-07
automatable: false
covered_by: []
---

## Behavior

Pasting a copied image into the desktop agent composer attaches it as an
**inline, perceive-only** image: it is downscaled/encoded client-side to a
base64 data-URL `file` part and sent to the model so the model literally sees
the pixels. No filesystem path is surfaced to the agent (Claude-Code-style) —
the agent can describe the image but cannot operate on it as a file.

The image rides the message as an AI-SDK `file` part. The pipeline already
forwards + persists `file` parts, so a later turn (even text-only) still has the
image in context — the model view is rebuilt from the DB each turn.

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
5. Without attaching anything, send a follow-up: "describe it again in one line."
   - Expected: the model still references the same image (durability — it was
     persisted and re-sent from the DB on this turn).

## Notes

- Encoding/policy: `editor/lib/agent-chat/image-attachment.ts`
  (`encodeImageFile`, downscale to ~1568px / ~5 MB, PNG→JPEG ladder).
- Paste/drop hook is a generic passthrough on the composer kit
  (`editor/kits/composer/composer-react.tsx` → `onImageFiles`); the desktop
  wiring + chip render is in
  `editor/scaffolds/desktop/shared/agent-composer-input.tsx`.
- The model→image round-trip (incl. multi-turn + resume) is automated against a
  real model in `packages/grida-ai-agent/src/runtime/runtime.live.test.ts`
  (gated `GRIDA_LIVE_AGENT=1`); this TC covers the UI gesture that test can't.
- A server-side size guard rejects inline images >~8 MB before persistence
  (`run-input.ts` `normalizeWireParts`).
