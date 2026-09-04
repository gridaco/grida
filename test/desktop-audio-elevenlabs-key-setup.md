---
id: TC-DESKTOP-AUDIO-001
title: ElevenLabs audio tools recover through an addressable API-key setup flow
module: desktop
area: audio
tags: [elevenlabs, byok, sound-effects, voice, settings]
status: untested
severity: medium
date: 2026-09-04
updated: 2026-09-04
automatable: false
covered_by:
  - packages/grida-ai-agent/src/http/routes/sound-effects.test.ts
  - packages/grida-ai-agent/src/http/routes/text-to-speech.test.ts
---

## Behavior

When no ElevenLabs API key is stored, the SFX and Voice composers show a
concise setup notice instead of exposing the daemon's transport error. The
notice explains that ElevenLabs is required and offers one primary action. It
must not imply that Grida credits fund ElevenLabs audio while that workflow
remains BYOK-only.

The setup action opens Desktop Settings at the ElevenLabs provider row. That
row is expanded, centered in view, and keyboard-focused so the next action is
unambiguous. Returning to SFX after saving a key restores the composer.

## Steps

1. In Desktop Settings, remove the ElevenLabs key, then open the SFX tool.
2. Expected: a **Connect ElevenLabs** notice appears in the composer area; no
   raw `[grida] /audio/sound-effects/generate` error is visible and there is no
   Grida-credit purchase claim.
3. Click **Open ElevenLabs settings**.
4. Expected: Desktop navigates to
   `/desktop/settings#provider-elevenlabs`; the ElevenLabs row is centered,
   expanded, and its disclosure button has keyboard focus.
5. Save a valid ElevenLabs development key, return to SFX, and wait for the
   presence check.
6. Expected: the normal SFX prompt and model picker replace the setup notice,
   and generation can be submitted.
7. Open the Voice tool with the key connected, then remove the key in Settings
   and return to Voice.
8. Expected: the same setup notice replaces the Voice composer. No raw daemon
   error or empty voice selector is shown.
9. Load the hosted renderer against an older Desktop bridge fixture where
   `audio.soundEffects` and `audio.textToSpeech` are absent.
10. Expected: each affected tool asks the user to update Grida Desktop before
    any ElevenLabs key prompt is shown.

## Notes

The renderer checks only whether a key exists. Secret material remains in the
Desktop host and is never readable through the renderer bridge.
