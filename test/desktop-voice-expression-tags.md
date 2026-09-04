---
id: TC-DESKTOP-AUDIO-002
title: Voice keeps Eleven v3 expression tags editable and sends them as text
module: desktop
area: audio
tags: [elevenlabs, voice, text-to-speech, audio-tags]
status: untested
severity: medium
date: 2026-09-04
updated: 2026-09-04
automatable: false
covered_by:
  - editor/scaffolds/desktop/audio-gen/speech-prompt.test.ts
  - packages/grida-ai-agent/src/http/routes/text-to-speech.test.ts
---

## Behavior

Voice uses Eleven v3's square-bracket expression tags as ordinary prompt text.
The starter menu inserts a tag at the current selection with readable spacing,
but it does not turn tags into hidden metadata or reject tags typed manually.
Successful speech opens in the shared waveform player and remains downloadable.

## Steps

1. Connect an ElevenLabs key with **Voices Read** and **Text to Speech** access,
   then open the Voice tool.
2. Expected: the voice picker contains the account's voices, **Eleven v3** is
   selected, and the Generate button remains disabled until a voice is ready.
3. Type `I did not expect that.`, place the caret before `expect`, and choose
   **Expression → Emotion → Excited**.
4. Expected: `[excited]` is inserted at the caret with spaces around it and the
   textarea regains focus immediately after the tag.
5. Add a custom `[mischievously]` tag by typing it directly, then generate.
6. Expected: the request succeeds without stripping either tag, and the result
   appears in the shared waveform player with the selected voice and Eleven v3
   shown as metadata.
